# Minimal Next.js integration

This is a separate Next.js app. It uses the released SDK archive, a single `TabDebug` wrapper in the layout, and two state hooks. It has no demo controller or replay engine.

From this directory, run `npm install` then `npm run dev`. Open http://localhost:3002 with a WebMCP-capable browser agent. The five tools should be available. Increment the counter, navigate to the other page, and inspect state: the counter stays mounted, while the old page's context is removed.

Run `npm run build` and `npm start` to check the default production behavior: the app works and no tools are registered.
