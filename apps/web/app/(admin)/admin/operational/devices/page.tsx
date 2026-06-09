// Operational alias — same component as /admin/devices, but lives under
// the operational sub-path so the sidebar nav groups it correctly.
// Both routes co-exist; the strategic page-link is removed from the
// sidebar but kept reachable via direct URL for backward-compat.

import DevicesPage from "../../devices/page"
export default DevicesPage
