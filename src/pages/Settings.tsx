
import Dashboard from "@/components/layout/Dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building, Calendar, Clock, DollarSign, Lock, Database, ShieldCheck } from "lucide-react";
import CompanySetupModal from "@/components/company/CompanySetupModal";
import CurrencySettings from "@/components/settings/CurrencySettings";
import WorkingDaysConfig from "@/components/settings/WorkingDaysConfig";
import MonthlyWorkingDaysManager from "@/components/settings/MonthlyWorkingDaysManager";
import WorkingTimePolicies from "@/components/settings/WorkingTimePolicies";
import PasswordSettings from "@/components/settings/PasswordSettings";
import BackupManager from "@/components/backup/BackupManager";
import SecuritySettings from "@/components/settings/SecuritySettings";

export default function SettingsPage() {
    <Dashboard title="Settings">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your company settings, preferences, and system parameters
            </p>
          </div>
        </div>

        <Tabs defaultValue="company" className="space-y-6">
          <div className="rounded-2xl border border-border bg-card shadow-sm p-2 overflow-x-auto hide-scrollbar">
            <TabsList className="bg-transparent flex md:grid md:grid-cols-8 gap-2 h-auto min-w-max md:min-w-0 p-0">
              {[
                { value: "company", icon: Building, label: "Company" },
                { value: "currency", icon: DollarSign, label: "Currency" },
                { value: "working-days", icon: Calendar, label: "Working Days" },
                { value: "monthly-config", icon: Settings, label: "Monthly" },
                { value: "policies", icon: Clock, label: "Policies" },
                { value: "security", icon: ShieldCheck, label: "Security" },
                { value: "password", icon: Lock, label: "Password" },
                { value: "backup", icon: Database, label: "Backup" },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex flex-col items-center gap-1.5 py-3 px-4 md:px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm text-muted-foreground hover:bg-muted/50 transition-all duration-200 rounded-xl"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {[
            { value: "company", icon: Building, title: "Company Information", desc: "Manage your company details and branding", color: "text-primary", bg: "bg-primary/10", content: <CompanySetupModal /> },
            { value: "currency", icon: DollarSign, title: "Currency Settings", desc: "Configure your preferred currency for salary calculations", color: "text-green-600", bg: "bg-green-500/10", content: <CurrencySettings /> },
            { value: "working-days", icon: Calendar, title: "Working Days Configuration", desc: "Set up your company's working days and weekend schedule", color: "text-blue-600", bg: "bg-blue-500/10", content: <WorkingDaysConfig /> },
            { value: "monthly-config", icon: Settings, title: "Monthly Working Days", desc: "Configure working days and salary divisors for specific months", color: "text-violet-600", bg: "bg-violet-500/10", content: <MonthlyWorkingDaysManager /> },
            { value: "policies", icon: Clock, title: "Working Time Policies", desc: "Define working hours, overtime rules, and time-off policies", color: "text-orange-600", bg: "bg-orange-500/10", content: <WorkingTimePolicies /> },
            { value: "security", icon: ShieldCheck, title: "Security & Biometrics", desc: "Configure 2FA, biometric lock, Face ID, and fingerprint authentication", color: "text-emerald-600", bg: "bg-emerald-500/10", content: <SecuritySettings /> },
            { value: "password", icon: Lock, title: "Password & Security", desc: "Update your password and manage security settings", color: "text-red-600", bg: "bg-red-500/10", content: <PasswordSettings /> },
            { value: "backup", icon: Database, title: "Backup & Restore", desc: "Create backups and restore your data safely", color: "text-teal-600", bg: "bg-teal-500/10", content: <BackupManager /> },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsContent key={tab.value} value={tab.value} className="animate-fade-in focus-visible:outline-none focus-visible:ring-0 space-y-6">
                <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center gap-4 px-6 py-5 bg-muted/5 border-b border-border/50">
                    <div className={`p-2.5 rounded-xl ${tab.bg} shadow-sm`}>
                      <Icon className={`h-5 w-5 ${tab.color}`} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{tab.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{tab.desc}</p>
                    </div>
                  </div>
                  <div className="p-6">
                    {tab.content}
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </Dashboard>
  );
}
