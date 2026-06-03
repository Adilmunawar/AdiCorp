
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleDollarSign, Calendar, Briefcase, Loader2 } from "lucide-react";
import { formatCurrencySync } from "@/utils/salaryCalculations";
import { useCurrency } from "@/hooks/useCurrency";

interface SalaryStats {
  totalBudgetSalary: number;
  totalCalculatedSalary: number;
  averageDailyRate: number;
  employeeCount: number;
}

interface SalaryStatsProps {
  stats: SalaryStats;
  loading: boolean;
}

export default function SalaryStats({ stats, loading }: SalaryStatsProps) {
  useCurrency();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
      <Card className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full transition-transform group-hover:scale-110" />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CircleDollarSign className="h-5 w-5 text-primary" />
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Salary Budget</p>
          </div>
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : (
            <div className="space-y-1">
              <span className="text-3xl font-black text-foreground">{formatCurrencySync(stats.totalBudgetSalary)}</span>
              <p className="text-xs font-semibold text-muted-foreground">For {stats.employeeCount} active employees</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-green-500/20 bg-card shadow-sm rounded-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-bl-full transition-transform group-hover:scale-110" />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Calculated Payout</p>
          </div>
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-green-600" /> : (
            <div className="space-y-1">
              <span className="text-3xl font-black text-green-600">{formatCurrencySync(stats.totalCalculatedSalary)}</span>
              <p className="text-xs font-semibold text-muted-foreground">Based on actual attendance</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-blue-500/20 bg-card shadow-sm rounded-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full transition-transform group-hover:scale-110" />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Average Daily Rate</p>
          </div>
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-blue-600" /> : (
            <div className="space-y-1">
              <span className="text-3xl font-black text-blue-600">{formatCurrencySync(stats.averageDailyRate)}</span>
              <p className="text-xs font-semibold text-muted-foreground">Per employee per working day</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
