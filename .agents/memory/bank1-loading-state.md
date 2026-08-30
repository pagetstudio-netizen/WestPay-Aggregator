---
name: Bank 1 loading state
description: The Bank 1 API checkout loading indicator needs animation CSS available in its initial render path.
---

The Bank 1 API checkout now displays a moving blue loading indicator while the page is being prepared. This behavior was confirmed working after deployment, including on mobile.

**Why:** The initial loading branch renders before the main checkout styles, so an animation declared only in the later page markup cannot affect the first loading frame.

**How to apply:** Keep the loading state's animation self-contained in its early-return markup whenever the checkout loading UI is changed.