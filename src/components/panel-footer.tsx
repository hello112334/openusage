import { Button } from "@/components/ui/button";

interface PanelFooterProps {
  version: string;
  onRefresh: () => void;
}

export function PanelFooter({ version, onRefresh }: PanelFooterProps) {
  return (
    <div className="flex justify-between items-center pt-3 border-t">
      <span className="text-sm text-muted-foreground">OpenUsage {version}</span>
      <Button variant="link" size="sm" onClick={onRefresh} className="px-0">
        Refresh all
      </Button>
    </div>
  );
}
