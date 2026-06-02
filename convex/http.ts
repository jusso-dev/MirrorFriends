import { httpRouter } from "convex/server";
import { auth } from "./auth";

// ---------------------------------------------------------------------------
// HTTP routes. Convex Auth registers its sign-in / OAuth callback / token
// endpoints here. Add any custom HTTP actions below `auth.addHttpRoutes`.
// ---------------------------------------------------------------------------

const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
