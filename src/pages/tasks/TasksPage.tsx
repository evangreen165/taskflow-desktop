export default function TasksPage(): JSX.Element {
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
      <h1 style={{ fontSize: 20, fontWeight: 650, marginBottom: 6 }}>Задачи</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
        Раздел задач появится на следующем этапе. Авторизация, права и роли уже работают.
      </p>
    </div>
  );
}
