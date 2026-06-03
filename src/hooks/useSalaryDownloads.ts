
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/salaryCalculations";
import jsPDF from "jspdf";
import "jspdf-autotable";

interface EmployeeSalaryData {
  employeeId: string;
  employeeName: string;
  rank: string;
  monthlySalary: number;
  presentDays: number;
  shortLeaveDays: number;
  leaveDays: number;
  calculatedSalary: number;
  actualWorkingDays: number;
  dailyRate: number;
}

export function useSalaryDownloads(
  employeeSalaryData: EmployeeSalaryData[],
  totalWorkingDaysThisMonth: number,
  currentMonthName: string,
  companyDetails?: { name?: string | null; logo_url?: string | null }
) {
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const downloadFile = useCallback((content: string, filename: string, type: string = 'text/csv') => {
    const blob = new Blob([content], { type: `${type};charset=utf-8;` });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleSalarySheetDownload = useCallback(async () => {
    setDownloading(true);
    try {
      let csvContent = 'Employee,Position,Monthly Salary,Daily Rate,Working Days,Calculated Salary,Status\n';
      employeeSalaryData.forEach(data => {
        csvContent += `"${data.employeeName}","${data.rank}","${formatCurrency(data.monthlySalary)}","${formatCurrency(data.dailyRate)}","${data.actualWorkingDays}/${totalWorkingDaysThisMonth}","${formatCurrency(data.calculatedSalary)}","${data.actualWorkingDays > 0 ? 'Earned' : 'No Attendance'}"\n`;
      });
      
      downloadFile(csvContent, `salary-sheet-${currentMonthName.replace(' ', '-')}.csv`);
      
      toast({
        title: "Download completed",
        description: "Salary sheet exported successfully",
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }, [employeeSalaryData, currentMonthName, totalWorkingDaysThisMonth, toast, downloadFile]);

  const handlePayslipsDownload = useCallback(async () => {
    setDownloading(true);
    try {
      let csvContent = 'Employee,Position,Monthly Salary,Daily Rate,Present Days,Short Leave,Working Days,Calculated Salary\n';
      employeeSalaryData.forEach(data => {
        csvContent += `"${data.employeeName}","${data.rank}","${formatCurrency(data.monthlySalary)}","${formatCurrency(data.dailyRate)}","${data.presentDays}","${data.shortLeaveDays}","${data.actualWorkingDays}/${totalWorkingDaysThisMonth}","${formatCurrency(data.calculatedSalary)}"\n`;
      });
      
      downloadFile(csvContent, `payslips-${currentMonthName.replace(' ', '-')}.csv`);
      
      toast({
        title: "Download completed",
        description: "Payslips exported successfully",
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }, [employeeSalaryData, currentMonthName, totalWorkingDaysThisMonth, toast, downloadFile]);

  const handleIndividualPayslipDownload = useCallback((data: EmployeeSalaryData) => {
    try {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(22);
      doc.setTextColor(33, 33, 33);
      doc.text(companyDetails?.name || "Company Payslip", 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Salary Slip for ${currentMonthName}`, 14, 30);
      
      // Employee Info Table
      (doc as any).autoTable({
        startY: 40,
        head: [['Employee Details', '']],
        body: [
          ['Name', data.employeeName],
          ['Position', data.rank],
          ['Basic Salary', formatCurrency(data.monthlySalary)],
          ['Daily Rate', formatCurrency(data.dailyRate)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
        margin: { top: 10 }
      });

      // Attendance Info Table
      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Attendance Details', '']],
        body: [
          ['Expected Working Days', totalWorkingDaysThisMonth],
          ['Earned Working Days', data.actualWorkingDays],
          ['Present Days', data.presentDays],
          ['Short Leave Days', data.shortLeaveDays],
          ['Leave Days', data.leaveDays],
        ],
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
      });

      // Final Calculation Table
      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Salary Calculation', 'Amount']],
        body: [
          ['Calculated Net Salary', formatCurrency(data.calculatedSalary)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [46, 204, 113] },
        styles: { fontStyle: 'bold' }
      });
      
      // Footer
      doc.setFontSize(8);
      doc.text("This is a computer generated payslip and does not require a signature.", 14, doc.internal.pageSize.height - 10);
      
      doc.save(`payslip-${data.employeeName}-${currentMonthName.replace(' ', '-')}.pdf`);
      
      toast({
        title: "Download completed",
        description: "Payslip PDF generated successfully",
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Download failed",
        description: "Could not generate PDF",
        variant: "destructive",
      });
    }
  }, [totalWorkingDaysThisMonth, currentMonthName, companyDetails, toast]);

  return {
    downloading,
    handleSalarySheetDownload,
    handlePayslipsDownload,
    handleIndividualPayslipDownload
  };
}
