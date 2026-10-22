// PDFs are bundled as Data modules (wrangler.toml [[rules]]).
declare module '*.pdf' {
  const bytes: ArrayBuffer;
  export default bytes;
}
