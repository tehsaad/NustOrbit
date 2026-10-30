import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SCRAPE_JS } from "./scrape";

// react-native-webview's bundled types don't line up with React 19's JSX typing
// in this Expo SDK, so the element is cast to resolve TS. Runtime is unaffected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WV: any = WebView;

const QALAM_URL = "https://qalam.nust.edu.pk/";
const KEY = { url: "orbit_url", token: "orbit_token" };

type Config = { url: string; token: string };

type ScrapeMsg =
  | { type: "scrape"; url: string; loggedIn: boolean; tableCount: number; kind: string | null; rows: Record<string, string>[]; mapping: Record<string, string>; unmatched: string[] }
  | { type: "error"; error: string };

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<"home" | "qalam">("home");
  const [urlInput, setUrlInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const webRef = useRef<{ injectJavaScript: (js: string) => void }>(null);

  useEffect(() => {
    (async () => {
      const [url, token] = await Promise.all([AsyncStorage.getItem(KEY.url), AsyncStorage.getItem(KEY.token)]);
      if (url && token) setConfig({ url, token });
      setLoaded(true);
    })();
  }, []);

  async function savePair() {
    const url = urlInput.trim().replace(/\/+$/, "");
    const token = codeInput.trim();
    if (!/^https?:\/\//.test(url) || token.indexOf(".") <= 0) {
      Alert.alert("Check details", "Enter a valid Orbit URL and the full pairing code.");
      return;
    }
    await AsyncStorage.multiSet([[KEY.url, url], [KEY.token, token]]);
    setConfig({ url, token });
    setMsg("Paired with Orbit.");
  }

  async function unpair() {
    await AsyncStorage.multiRemove([KEY.url, KEY.token]);
    setConfig(null);
    setMsg(null);
  }

  async function onMessage(e: { nativeEvent: { data: string } }) {
    let data: ScrapeMsg;
    try {
      data = JSON.parse(e.nativeEvent.data) as ScrapeMsg;
    } catch {
      return;
    }
    if (data.type === "error") {
      setMsg("Couldn't read the page: " + data.error);
      return;
    }
    if (data.type !== "scrape") return;
    if (data.loggedIn === false) {
      setMsg("Log into Qalam first, then open your marks / attendance / results page and tap Pull page.");
      return;
    }
    if (!data.kind || data.rows.length === 0) {
      setMsg(`Found ${data.tableCount} table(s) but no recognizable data here. Open your marks, attendance or results page, then Pull page.`);
      return;
    }
    if (!config) return;
    setBusy(true);
    setMsg(`Sending ${data.rows.length} ${data.kind} row(s) to Orbit…`);
    try {
      const res = await fetch(config.url + "/api/integrations/qalam/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.token },
        body: JSON.stringify({ kind: data.kind, rows: data.rows, extractedAt: new Date().toISOString() }),
      });
      const body = (await res.json().catch(() => ({}))) as { imported?: number; unchanged?: number };
      if (res.ok) setMsg(`Imported ${body.imported ?? data.rows.length} ${data.kind} row(s)${body.unchanged ? `, ${body.unchanged} unchanged` : ""}.`);
      else if (res.status === 401) setMsg("Orbit rejected the pairing code. Create a fresh one in Orbit and re-pair.");
      else if (res.status === 429) setMsg("Too soon after the last sync — wait a few seconds and try again.");
      else setMsg(`Sync failed (HTTP ${res.status}).`);
    } catch (err) {
      setMsg("Couldn't reach Orbit: " + String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (screen === "qalam") {
    return (
      <SafeAreaView style={styles.flex}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.bar}>
          <Pressable onPress={() => setScreen("home")} hitSlop={12}>
            <Text style={styles.link}>‹ Done</Text>
          </Pressable>
          <Text style={styles.barTitle}>Qalam</Text>
          <Pressable disabled={busy} onPress={() => webRef.current?.injectJavaScript(SCRAPE_JS)} hitSlop={12}>
            <Text style={[styles.link, busy && styles.dim]}>{busy ? "…" : "Pull page"}</Text>
          </Pressable>
        </View>
        {msg ? <Text style={styles.banner}>{msg}</Text> : null}
        <WV
          ref={webRef}
          source={{ uri: QALAM_URL }}
          onMessage={onMessage}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          style={styles.flex}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.h1}>Orbit · Qalam</Text>

        {config ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Connected</Text>
            <Text style={styles.p}>Paired with {config.url}</Text>
            <Pressable
              style={styles.btn}
              onPress={() => {
                setMsg(null);
                setScreen("qalam");
              }}
            >
              <Text style={styles.btnText}>Open Qalam & sync</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={unpair}>
              <Text style={styles.btnGhostText}>Unpair</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.h2}>Pair with your Orbit account</Text>
            <Text style={styles.p}>In Orbit on the web, open Integrations → Qalam → Connect the app, create a pairing code, then enter it here with your Orbit URL.</Text>
            <Text style={styles.label}>Orbit URL</Text>
            <TextInput style={styles.input} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://nustorbit.vercel.app" placeholderTextColor="#9aa4b2" value={urlInput} onChangeText={setUrlInput} />
            <Text style={styles.label}>Pairing code</Text>
            <TextInput style={styles.input} autoCapitalize="none" autoCorrect={false} placeholder="connectionId.secret" placeholderTextColor="#9aa4b2" value={codeInput} onChangeText={setCodeInput} />
            <Pressable style={styles.btn} onPress={savePair}>
              <Text style={styles.btnText}>Save pairing</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.h3}>How it works</Text>
        <Text style={styles.p}>
          Tap “Open Qalam & sync”, log into Qalam yourself, open your marks / attendance / results page, then tap “Pull page”. The app reads that page inside your own Qalam session
          and sends the data to Orbit. Your Qalam password is never seen or stored by the app.
        </Text>
        {msg ? <Text style={styles.banner}>{msg}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  screen: { flex: 1, backgroundColor: "#f6f7f9" },
  pad: { padding: 20, gap: 8 },
  h1: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  h3: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginTop: 20, marginBottom: 4 },
  p: { fontSize: 14, lineHeight: 20, color: "#475569" },
  label: { fontSize: 12, color: "#64748b", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#d8dee6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#0f172a", backgroundColor: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e8ebef" },
  btn: { backgroundColor: "#4f46e5", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 16 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnGhost: { paddingVertical: 10, alignItems: "center", marginTop: 6 },
  btnGhostText: { color: "#64748b", fontWeight: "600", fontSize: 13 },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e8ebef" },
  barTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  link: { fontSize: 15, fontWeight: "600", color: "#4f46e5" },
  dim: { opacity: 0.5 },
  banner: { fontSize: 13, color: "#0f172a", backgroundColor: "#eef2ff", padding: 10, borderRadius: 8, marginTop: 12 },
});
