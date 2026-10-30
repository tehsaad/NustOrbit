import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock,
  LayoutDashboard,
  Library,
  NotebookPen,
  PlugZap,
  Settings,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard, mobile: true },
  { href: "/courses", label: "Courses", icon: Library },
  { href: "/marks", label: "Marks", icon: BookOpen },
  { href: "/assignments", label: "Assignments", icon: ClipboardList, mobile: true },
  { href: "/attendance", label: "Attendance", icon: UserCheck },
  { href: "/timetable", label: "Timetable", icon: Clock, mobile: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, mobile: true },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/integrations", label: "Integrations", icon: PlugZap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
