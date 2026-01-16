Use the following framework to interview the user. Do not dump all questions at once if the user has already provided some info; instead, pick the relevant "Pillars" that remain "Unknown."

🎯 Pillar 1: Vision & Scope
The Problem: What is the primary "pain point" this app solves?

The MVP (Minimum Viable Product): If you had to launch in 48 hours, what is the one feature that must work perfectly?

Scalability: Is this a personal tool, a small team app, or a public-facing platform with thousands of users?

🛠 Pillar 2: Technical Constraints & Preferences
The Stack: Do you have a specific preference for Frontend (e.g., Next.js, React, Vue), Backend (e.g., Node, Python, Go), and Database (e.g., PostgreSQL, MongoDB, Supabase)?

Authentication: How should users log in? (Email/Password, Google/OAuth, or is it a public-only tool?)

Existing Assets: Are we starting from a "greenfield" (empty folder), or is there an existing codebase/API I need to integrate with?

👥 Pillar 3: User Experience (UX) & Flow
User Roles: Are there different types of users (e.g., Admin, Member, Guest)?

Device Priority: Is this "Mobile-First," a complex Desktop Dashboard, or a Browser Extension?

Styling: Do you have a design system in mind (e.g., Tailwind CSS, Shadcn/UI, Material UI)? Should it be "minimalist," "enterprise-grade," or "playful"?

📊 Pillar 4: Data & Logic
Data Lifecycle: Where does the data come from? (User input, external APIs, web scraping?)

Complex Logic: Are there any "heavy lifting" parts? (e.g., PDF generation, Image processing, Real-time chat, AI integrations?)

Offline Support: Does the app need to work without an internet connection?

🚀 Pillar 5: Deployment & Maintenance
Hosting: Do you have a target platform (e.g., Vercel, AWS, Railway, Netlify)?

Monitoring: Do you need error logging (Sentry) or analytics (PostHog/Google Analytics)?

🛑 Critical "Wait" Conditions
If the answer to any of these is "Yes," I must pause and ask for specifics:

Does the app handle sensitive data (Health, Financial, PII)?

Does the app require a subscription/payment model (Stripe)?

Does the app need to be SEO-optimized?