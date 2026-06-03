
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Settings, Check, AlertCircle } from "lucide-react";
import { WorkingDayConfig } from "@/types/events";
import { ResponsiveContainer } from "@/components/layout/ResponsiveContainer";
import BrandLoader from "@/components/common/BrandLoader";

export default function WorkingDaysConfig() {
  const [config, setConfig] = useState<WorkingDayConfig>({
    company_id: '',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { userProfile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (userProfile?.company_id) {
      fetchConfig();
    }
  }, [userProfile?.company_id]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('working_days_config')
        .select('*')
        .eq('company_id', userProfile?.company_id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setConfig(data);
      } else {
        setConfig(prev => ({ ...prev, company_id: userProfile?.company_id || '' }));
      }
    } catch (error) {
      console.error("Error fetching working days config:", error);
      toast({
        title: "Error",
        description: "Failed to load working days configuration.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDayChange = (day: keyof WorkingDayConfig, checked: boolean) => {
    setConfig(prev => ({ ...prev, [day]: checked }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (!userProfile?.company_id) return;

      const { error } = await supabase
        .from('working_days_config')
        .upsert({
          company_id: userProfile.company_id,
          monday: config.monday,
          tuesday: config.tuesday,
          wednesday: config.wednesday,
          thursday: config.thursday,
          friday: config.friday,
          saturday: config.saturday,
          sunday: config.sunday,
        }, {
          onConflict: 'company_id'
        });

      if (error) throw error;

      setHasChanges(false);
      toast({
        title: "Settings Saved",
        description: "Working days configuration has been updated successfully.",
      });
    } catch (error) {
      console.error("Error saving config:", error);
      toast({
        title: "Error",
        description: "Failed to save working days configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const days = [
    { key: 'monday', label: 'Monday', shortLabel: 'Mon' },
    { key: 'tuesday', label: 'Tuesday', shortLabel: 'Tue' },
    { key: 'wednesday', label: 'Wednesday', shortLabel: 'Wed' },
    { key: 'thursday', label: 'Thursday', shortLabel: 'Thu' },
    { key: 'friday', label: 'Friday', shortLabel: 'Fri' },
    { key: 'saturday', label: 'Saturday', shortLabel: 'Sat' },
    { key: 'sunday', label: 'Sunday', shortLabel: 'Sun' },
  ];

  const selectedDaysCount = days.filter(day => 
    config[day.key as keyof WorkingDayConfig] as boolean
  ).length;

  const applyTemplate = (mode: "mon_fri" | "mon_sat") => {
    const nextConfig = {
      ...config,
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: mode === "mon_sat",
      sunday: false,
    };

    setConfig(nextConfig);
    setHasChanges(true);
  };

  if (loading) {
    return (
      <BrandLoader
        message="Loading day management"
        subtitle="Syncing your company working-day rules"
      />
    );
  }

  return (
    <ResponsiveContainer>
      <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 bg-muted/5 border-b border-border/50">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              Working Days Configuration
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Configure which days are considered working days for your company.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-5 md:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="rounded-xl border border-border/50 bg-background shadow-sm p-3 flex flex-wrap items-center gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick Templates</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="h-7 px-3 text-[10px] rounded-lg border-border/60 bg-muted/20 hover:bg-muted/40 font-semibold" onClick={() => applyTemplate("mon_fri")}>Mon–Fri</Button>
                <Button type="button" variant="outline" className="h-7 px-3 text-[10px] rounded-lg border-border/60 bg-muted/20 hover:bg-muted/40 font-semibold" onClick={() => applyTemplate("mon_sat")}>Mon–Sat</Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 shadow-sm shrink-0">
              <AlertCircle className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-bold text-primary/80 uppercase tracking-wider">
                {selectedDaysCount} {selectedDaysCount === 1 ? 'day' : 'days'} / week
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {days.map((day) => {
              const isChecked = config[day.key as keyof WorkingDayConfig] as boolean;
              return (
                <div 
                  key={day.key} 
                  className={`
                    relative flex flex-col items-center justify-center space-y-3 p-4 rounded-xl border transition-all duration-200 overflow-hidden
                    ${isChecked 
                      ? 'bg-primary/5 border-primary/30 shadow-sm' 
                      : 'bg-background border-border/60 hover:border-border hover:bg-muted/10'
                    }
                  `}
                >
                  {isChecked && <div className="absolute top-0 right-0 w-8 h-8 bg-primary/10 rounded-bl-xl" />}
                  <Switch
                    id={day.key}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleDayChange(day.key as keyof WorkingDayConfig, checked)}
                    aria-label={`Toggle ${day.label} as working day`}
                  />
                  <Label 
                    htmlFor={day.key} 
                    className={`text-xs sm:text-sm font-bold text-center cursor-pointer select-none transition-colors ${isChecked ? 'text-primary' : 'text-foreground'}`}
                  >
                    <span className="block sm:hidden">{day.shortLabel}</span>
                    <span className="hidden sm:block">{day.label}</span>
                  </Label>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Important Notes</p>
                <ul className="list-inside list-disc space-y-1 text-[11px] text-blue-700/80 font-medium">
                  <li>Employees will only appear in attendance for configured working days.</li>
                  <li>Salary calculations will be based on selected working days.</li>
                  <li>Changes take effect immediately after saving.</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 border-t border-border/50 pt-5 sm:flex-row sm:justify-end">
            {hasChanges && (
              <Button 
                variant="outline" 
                onClick={() => {
                  fetchConfig();
                  setHasChanges(false);
                }}
                className="rounded-xl h-9 px-4 text-xs font-bold border-border/60"
              >
                Reset Changes
              </Button>
            )}
            <Button 
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="rounded-xl h-9 px-6 text-xs font-bold shadow-sm"
              aria-label="Save working days configuration"
            >
              {saving ? (
                <>
                  <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </ResponsiveContainer>
  );
}
