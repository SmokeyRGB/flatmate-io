import { createFileRoute, Outlet, redirect, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyContext, getNotifications } from "@/lib/fm/functions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserRound, Home, House, ListChecks, Users2, Settings, LogOut, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const getCtx = useServerFn(getMyContext);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getCtx });
  const fetchNotifications = useServerFn(getNotifications);
  const { data: notifications } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: fetchNotifications,
    enabled: Boolean(me?.profile),
    refetchInterval: 60_000,
  });
  const unread = notifications?.unread ?? 0;

  const canOrganise = Boolean(me?.isModerator || me?.isHouseholdAccount);
  const canCast = Boolean(me?.profile) && !me?.isHouseholdAccount;
  const mobilePageTitle = pathname.startsWith("/casting")
    ? "Sehen"
    : pathname.startsWith("/rangliste")
      ? "Rangliste"
      : null;

  // U-2: genau zwei Tabs. „Casting" entscheidet selbst, ob erst gesehen oder schon gerankt wird.
  const nav = [
    { to: "/zuhause", label: "Start", icon: House },
    ...(canCast ? [{ to: "/casting", label: "Casting", icon: ListChecks } as const] : []),
  ] as { to: "/zuhause" | "/casting"; label: string; icon: typeof House }[];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:flex md:justify-between md:py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <Link to="/zuhause" className="shrink-0 font-display text-lg font-semibold text-primary">
              flatmate.io
            </Link>
            {mobilePageTitle && (
              <span className="truncate font-display text-base font-semibold text-foreground md:hidden">
                {mobilePageTitle}
              </span>
            )}
          </div>
          <nav className="hidden gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
                  (pathname.startsWith(item.to)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground")
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="relative px-2" aria-label="Mitteilungen">
            <Link to="/mitteilungen">
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <UserRound className="size-4" />
                <span className="hidden sm:inline">{me?.profile?.display_name ?? "Konto"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block font-medium">{me?.profile?.display_name}</span>
                <span className="block text-xs text-muted-foreground">{me?.householdName}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/teilnehmende">
                  <Users2 className="size-4" /> Mitglieder
                </Link>
              </DropdownMenuItem>
              {canOrganise && (
                <DropdownMenuItem asChild>
                  {pathname.startsWith("/organisation") ? (
                    <Link to="/zuhause">
                      <House className="size-4" /> Zur WG-Ansicht
                    </Link>
                  ) : (
                    <Link to="/organisation">
                      <Home className="size-4" /> Zur Organisation
                    </Link>
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/einstellungen">
                  <Settings className="size-4" /> Einstellungen
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="size-4" /> Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 h-16 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto grid w-full max-w-3xl" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map((item) => {
            const NavIcon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                className="flex h-16 items-center justify-center text-muted-foreground transition-colors"
              >
                <span className={active ? "grid size-11 place-items-center rounded-xl bg-secondary text-primary" : "grid size-11 place-items-center"}>
                  <NavIcon className="size-7" strokeWidth={active ? 2.4 : 1.8} />
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
