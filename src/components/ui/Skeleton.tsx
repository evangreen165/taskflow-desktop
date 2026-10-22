import type { CSSProperties } from "react";

import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

/** Animated placeholder box used while data loads from the SMB drive. */
export default function Skeleton({
  width = "100%",
  height = 12,
  radius = 6,
  className,
}: SkeletonProps): JSX.Element {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return (
    <span className={`${styles.skeleton} ${className ?? ""}`} style={style} aria-hidden="true" />
  );
}
