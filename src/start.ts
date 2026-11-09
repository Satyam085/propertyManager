import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

// Defining start.ts means installing the CSRF check for server functions ourselves.
const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf],
  serverFns: {
    // session expired mid-use → back to the login page instead of a cryptic error
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      if (res.status === 401) window.location.href = "/login";
      return res;
    },
  },
}));
