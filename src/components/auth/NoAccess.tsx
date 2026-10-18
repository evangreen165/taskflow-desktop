export default function NoAccess(): JSX.Element {
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        color: "var(--text-muted)",
        padding: 32,
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🚫</div>
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Недостаточно прав</h2>
        <p style={{ fontSize: 13.5, maxWidth: 360, lineHeight: 1.6 }}>
          Эта страница доступна только пользователям с соответствующим правом. Обратитесь к
          администратору workspace.
        </p>
      </div>
    </div>
  );
}
