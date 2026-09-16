/**
 * Route predicate shared by the layout and the sidebar.
 *
 * Matches by segment — a plain `startsWith('/ros')` would also claim a future
 * `/roster`, handing it the ROS identity and navigation.
 */
export function isRosPath(pathname: string): boolean {
  return pathname === '/ros' || pathname.startsWith('/ros/')
}
