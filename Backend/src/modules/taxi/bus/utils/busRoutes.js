// A bus can run several routes (main, mirrored return, admin-added extras).
// Each schedule names its route through `routeKey`; everything passenger
// facing should read the route of the schedule, not `busService.route`.

export const listBusRoutes = (busService = {}) => {
  const routes = [];
  if (busService?.route) routes.push({ key: 'main', ...busService.route });
  if (busService?.returnRouteEnabled && busService?.returnRoute?.originCity) {
    routes.push({ key: 'return', ...busService.returnRoute });
  }
  (Array.isArray(busService?.extraRoutes) ? busService.extraRoutes : []).forEach((item) => {
    if (item?.id) routes.push({ ...item, key: String(item.id) });
  });
  return routes;
};

export const resolveScheduleRoute = (busService = {}, schedule = null) => {
  const key = String(schedule?.routeKey || 'main');
  return listBusRoutes(busService).find((item) => item.key === key) || busService?.route || {};
};

// Returns the bus with `route` swapped for the schedule's route, so existing
// serializers that read `busService.route` keep working unchanged.
export const withScheduleRoute = (busService, schedule) => {
  if (!busService || !schedule || String(schedule.routeKey || 'main') === 'main') return busService;
  return { ...busService, route: resolveScheduleRoute(busService, schedule) };
};
