import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "overview" | "settings";

interface PanelHeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function PanelHeader({ activeTab, onTabChange }: PanelHeaderProps) {
  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as Tab)}>
      <TabsList className="w-full">
        <TabsTrigger value="overview" className="flex-1">
          Overview
        </TabsTrigger>
        <TabsTrigger value="settings" className="flex-1">
          Settings
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export type { Tab };
