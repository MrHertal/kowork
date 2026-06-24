import { m } from "@/paraglide/messages";

const PROVIDER_NOTES: { match: (id: string) => boolean; note: () => string }[] =
  [
    { match: (id) => id === "opencode", note: m.provider_note_opencode },
    { match: (id) => id === "opencode-go", note: m.provider_note_opencodeGo },
    { match: (id) => id === "anthropic", note: m.provider_note_anthropic },
    {
      match: (id) => id.startsWith("github-copilot"),
      note: m.provider_note_copilot,
    },
    { match: (id) => id === "openai", note: m.provider_note_openai },
    { match: (id) => id === "google", note: m.provider_note_google },
    { match: (id) => id === "openrouter", note: m.provider_note_openrouter },
    { match: (id) => id === "vercel", note: m.provider_note_vercel },
  ];

export function getProviderNote(id: string): string | undefined {
  return PROVIDER_NOTES.find((item) => item.match(id))?.note();
}
