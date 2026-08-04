import { OPERATOR_META, type OperatorCode } from "@/lib/operators";

export function RouteChip({
  shortName,
  operatorCode,
  size = "md",
}: Readonly<{
  shortName: string;
  operatorCode: OperatorCode | null;
  size?: "sm" | "md";
}>) {
  const meta = operatorCode ? OPERATOR_META[operatorCode] : null;
  return (
    <span
      className={
        size === "sm"
          ? "rounded-[5px] px-1.5 py-0.5 font-mono text-[11.5px] font-semibold"
          : "rounded-md px-2 py-0.5 font-mono text-[12.5px] font-semibold"
      }
      style={{
        background: meta?.chipBg ?? "#EEF1EA",
        color: meta?.chipFg ?? "#3D4A3F",
      }}
    >
      {shortName}
    </span>
  );
}
