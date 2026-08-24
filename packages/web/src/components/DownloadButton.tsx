const RELEASES_URL = "https://github.com/MrHertal/kowork/releases/latest";

export function DownloadButton() {
  return (
    <a
      href={RELEASES_URL}
      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/25"
    >
      Download
    </a>
  );
}
