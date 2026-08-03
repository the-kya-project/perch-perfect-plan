import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Treat data as fresh for a minute so navigating back to a screen
        // doesn't re-download everything (bird photos are large). Window-focus
        // refetch off for the same reason; mutations invalidate explicitly.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload a route's chunk on intent (hover/focus, and touchstart on mobile —
    // before the tap completes), so tapping into a not-yet-visited screen no
    // longer starts that chunk's download at tap time ("jumpy loading"). Route
    // code-splitting is on, so this fetches only the target's ~4–13 KB gz chunk,
    // and only when the user shows intent on that link — nothing at first load.
    defaultPreload: "intent",
    // Align preloaded-match freshness with the 60s React Query staleTime (was 0,
    // which is undocumented and, with no route loaders, effectively inert). 60s
    // lets the actual navigation reuse the preloaded match instead of redoing the
    // work; the chunk itself stays in the module cache regardless.
    defaultPreloadStaleTime: 60_000,
  });

  return router;
};
