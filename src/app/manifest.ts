import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit",
    short_name: "Orbit",
    description: "Everything in sync. Nothing forgotten.",
    start_url: "/",
    display: "standalone",
    background_color: "#141828",
    theme_color: "#141828",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
