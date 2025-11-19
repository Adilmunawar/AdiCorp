
import Dashboard from "@/components/layout/Dashboard";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import DashboardStats from "@/components/dashboard/DashboardStats";

export default function DashboardPage() {
  const { userProfile } = useAuth();

  return (
    <Dashboard title="Dashboard">
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card to-card border border-border shadow-xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJoc2woMjUwIDEwMCUgNjAlIC8gMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-50"></div>
          
          <div className="relative p-8">
            <div className="flex items-center justify-between flex-wrap gap-6">
              <div className="flex items-center gap-6">
                {userProfile?.companies?.logo && (
                  <div className="relative">
                    <img 
                      src={userProfile.companies.logo} 
                      alt="Company Logo" 
                      className="w-20 h-20 rounded-2xl object-cover ring-4 ring-primary/20 shadow-2xl"
                    />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-card flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
                    Welcome back{userProfile?.first_name ? `, ${userProfile.first_name}` : ''}!
                  </h1>
                  <p className="text-muted-foreground text-lg flex items-center gap-2">
                    {userProfile?.companies?.name ? (
                      <>
                        <span className="font-semibold text-foreground">Managing</span>
                        <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                          {userProfile.companies.name}
                        </span>
                      </>
                    ) : (
                      'Your HR management dashboard'
                    )}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 px-4 py-3 bg-card/80 backdrop-blur-sm rounded-xl border border-border shadow-lg">
                <Clock className="h-5 w-5 text-primary" />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-medium">Today</p>
                  <p className="text-sm font-semibold text-foreground">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Stats */}
        <DashboardStats />
      </div>
    </Dashboard>
  );
}
