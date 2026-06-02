// ---------------------------------------------------------------------------
// Convex Auth identity configuration. Convex Auth issues JWTs signed by this
// deployment; `CONVEX_SITE_URL` is the issuer. This file is read by Convex to
// validate incoming tokens.
// ---------------------------------------------------------------------------

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
