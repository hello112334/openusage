import { ProviderCard } from "@/components/provider-card";
import { mockProviders } from "@/lib/mock-data";

export function OverviewPage() {
  return (
    <div>
      {mockProviders.map((provider, index) => (
        <ProviderCard
          key={provider.id}
          name={provider.name}
          metrics={provider.metrics}
          showSeparator={index < mockProviders.length - 1}
        />
      ))}
    </div>
  );
}
