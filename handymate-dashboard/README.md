# Handymate Dashboard

AI-driven back office för hantverkare.

## Features

- 📊 **Dashboard** - Översikt av bokningar, kunder och ärenden
- 📅 **Bokningar** - Hantera alla bokningar
- 👥 **Kunder** - Kundregister med historik
- 🤖 **AI Inbox** - Intelligenta förslag och varningar
- 💬 **AI Copilot** - Fråga vad som helst om din verksamhet

## Tech Stack

- **Framework:** Next.js 14
- **Styling:** Tailwind CSS
- **Database:** Supabase
- **AI:** Claude (Anthropic)
- **Hosting:** Vercel

## Getting Started

1. Clone repo
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in values
4. Run dev server: `npm run dev`
5. Open http://localhost:3000

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `ANTHROPIC_API_KEY` - Anthropic API key for AI features

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/handymate-dashboard)
