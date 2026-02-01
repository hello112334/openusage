import { Separator } from "@/components/ui/separator";

interface Metric {
  label: string;
  value: string;
}

interface ProviderCardProps {
  name: string;
  metrics: Metric[];
  showSeparator?: boolean;
}

export function ProviderCard({ name, metrics, showSeparator = true }: ProviderCardProps) {
  return (
    <div>
      <div className="py-3">
        <h2 className="text-lg font-semibold mb-2">{name}</h2>
        <div className="space-y-1">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{metric.label}</span>
              <span className="text-sm font-medium">{metric.value}</span>
            </div>
          ))}
        </div>
      </div>
      {showSeparator && <Separator />}
    </div>
  );
}
