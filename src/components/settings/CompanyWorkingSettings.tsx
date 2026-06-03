import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Settings, Clock, Calendar } from "lucide-react";

interface CompanyWorkingSettings {
  company_id: string;
  default_working_days_per_week: number;
  default_working_days_per_month: number;
  salary_divisor: number;
  weekend_saturday: boolean;
  weekend_sunday: boolean;
}

export default function CompanyWorkingSettings() {
  const [settings, setSettings] = useState<CompanyWorkingSettings>({
    company_id: '',
    default_working_days_per_week: 5,
    default_working_days_per_month: 22,
    salary_divisor: 22,
    weekend_saturday: false,
    weekend_sunday: true,
  });
  const [loading, setLoading] = useState(false);
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const workweekOptions = [
    { value: 5, title: "5-Day Week", description: "Monday to Friday" },
    { value: 6, title: "6-Day Week", description: "Monday to Saturday" },
  ];

  useEffect(() => {
    if (userProfile?.company_id) { fetchSettings(); }
  }, [userProfile?.company_id]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('company_working_settings').select('*').eq('company_id', userProfile?.company_id).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) { setSettings(data); } else { setSettings(prev => ({ ...prev, company_id: userProfile?.company_id || '' })); }
    } catch (error) { console.error("Error fetching company working settings:", error); }
  };

  const handleWorkingDaysChange = (value: string) => {
    const workingDays = parseInt(value);
    const saturdayWorking = workingDays === 6;
    setSettings(prev => ({ ...prev, default_working_days_per_week: workingDays, default_working_days_per_month: saturdayWorking ? 26 : 22, salary_divisor: saturdayWorking ? 26 : 22, weekend_saturday: saturdayWorking }));
  };

  const handleSaturdayChange = (checked: boolean) => {
    setSettings(prev => ({ ...prev, weekend_saturday: checked, default_working_days_per_week: checked ? 6 : 5, default_working_days_per_month: checked ? 26 : 22, salary_divisor: checked ? 26 : 22 }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      if (!userProfile?.company_id) return;
      const { error } = await supabase.from('company_working_settings').upsert({ company_id: userProfile.company_id, default_working_days_per_week: settings.default_working_days_per_week, default_working_days_per_month: settings.default_working_days_per_month, salary_divisor: settings.salary_divisor, weekend_saturday: settings.weekend_saturday, weekend_sunday: settings.weekend_sunday }, { onConflict: 'company_id' });
      if (error) throw error;
      toast({ title: "Settings Saved", description: "Company working settings have been updated. Salary divisor is now " + (settings.weekend_saturday ? "26" : "22") + "." });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({ title: "Error", description: "Failed to save company working settings.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-5 bg-muted/5 border-b border-border/50">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Company Working Days Configuration
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Set your default workweek and divisor logic used in attendance and salary workflows.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-5 md:p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div>
              <Label className="mb-3 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Workweek Template</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {workweekOptions.map((option) => {
                  const isActive = settings.default_working_days_per_week === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleWorkingDaysChange(option.value.toString())}
                      className={`relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 group ${
                        isActive
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/50 bg-background hover:border-primary/30 hover:bg-muted/10"
                      }`}
                    >
                      {isActive && <div className="absolute top-0 right-0 w-8 h-8 bg-primary/10 rounded-bl-xl" />}
                      <p className={`text-sm font-bold ${isActive ? 'text-primary' : 'text-foreground group-hover:text-primary transition-colors'}`}>{option.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="space-y-3 pt-2">
              <Label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Weekend Policy</Label>
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background shadow-sm hover:border-border transition-colors">
                <div className="flex flex-col">
                  <Label htmlFor="sunday" className="text-xs font-bold cursor-pointer">Sunday as Off Day</Label>
                  <p className="text-[10px] text-muted-foreground">Standard weekly rest day</p>
                </div>
                <Switch id="sunday" checked={settings.weekend_sunday} onCheckedChange={(checked) => setSettings(prev => ({ ...prev, weekend_sunday: checked }))} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background shadow-sm hover:border-border transition-colors">
                <div className="flex flex-col">
                  <Label htmlFor="saturday" className="text-xs font-bold cursor-pointer">Saturday as Working Day</Label>
                  <p className="text-[10px] text-muted-foreground">Switch to 6-day workweek</p>
                </div>
                <Switch id="saturday" checked={settings.weekend_saturday} onCheckedChange={handleSaturdayChange} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Logic Summary</Label>
            
            <div className="p-4 bg-muted/20 rounded-xl border border-border/50 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="font-bold text-sm text-foreground">Monthly Variables</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground font-medium">Working Days / Month</span>
                <span className="text-sm text-foreground font-black bg-background border border-border/50 px-2 py-0.5 rounded-md">{settings.default_working_days_per_month}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-medium">Salary Divisor</span>
                <span className="text-sm text-foreground font-black bg-background border border-border/50 px-2 py-0.5 rounded-md">{settings.salary_divisor}</span>
              </div>
            </div>
            
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <span className="font-bold text-sm text-amber-700">Payroll Application</span>
              </div>
              <p className="text-[11px] text-amber-700/80 font-medium leading-relaxed">
                {settings.weekend_saturday ? "Saturday is configured as a working day. Daily wage rates will be calculated as (Monthly Salary ÷ 26)." : "Saturday is configured as an off-day. Daily wage rates will be calculated as (Monthly Salary ÷ 22)."}
              </p>
            </div>
          </div>
        </div>
        
        <div className="pt-5 border-t border-border/50 flex justify-end">
          <Button onClick={handleSave} disabled={loading} className="rounded-xl h-9 px-6 text-xs font-bold shadow-sm">
            {loading ? 'Saving Changes...' : 'Save Configuration'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
