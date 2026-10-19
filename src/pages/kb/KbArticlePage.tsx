import { useParams } from "react-router-dom";

export default function KbArticlePage(): JSX.Element {
  const { id } = useParams();
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 24,
        boxShadow: "var(--shadow)",
        maxWidth: 720,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 650, marginBottom: 6 }}>Статья</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
        Редактор статьи появится на этапе 4.3. ID: {id ?? "—"}
      </p>
    </div>
  );
}
