
import Dashboard from "@/components/layout/Dashboard";
import AttendanceTable from "@/components/attendance/AttendanceTable";

const AttendancePage = () => {
  return (
    <Dashboard title="Daily Attendance">
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <AttendanceTable />
      </div>
    </Dashboard>
  );
};

export default AttendancePage;
