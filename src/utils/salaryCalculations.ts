import { dataIntegrationService } from "@/services/dataIntegrationService";
import { supabase } from "@/integrations/supabase/client";

export interface SalaryData {
  employee_id: string;
  employee_name: string;
  basic_salary: number;
  present_days: number;
  absent_days: number;
  overtime_hours: number;
  gross_salary: number;
  deductions: number;
  net_salary: number;
  working_days: number;
}

const getCurrencySettings = async (companyId: string): Promise<{ code: string; locale: string }> => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('currency')
      .eq('id', companyId)
      .single();

    if (error || !data?.currency) {
      // Fallback to localStorage or default
      const storedCurrency = localStorage.getItem('app_currency') || 'USD';
      return {
        code: storedCurrency,
        locale: storedCurrency === 'USD' ? 'en-US' : 'en-US'
      };
    }

    // Update localStorage to match database
    localStorage.setItem('app_currency', data.currency);

    // Map currency codes to locales
    const currencyLocaleMap: Record<string, string> = {
      'USD': 'en-US',
      'EUR': 'de-DE',
      'GBP': 'en-GB',
      'JPY': 'ja-JP',
      'PKR': 'ur-PK',
      'INR': 'hi-IN',
      'CAD': 'en-CA',
      'AUD': 'en-AU',
      'CHF': 'de-CH',
      'CNY': 'zh-CN',
      'SGD': 'en-SG',
      'HKD': 'en-HK',
      'SEK': 'sv-SE',
      'NOK': 'nb-NO',
      'DKK': 'da-DK',
      'PLN': 'pl-PL',
      'CZK': 'cs-CZ',
      'HUF': 'hu-HU',
      'RUB': 'ru-RU',
      'BRL': 'pt-BR',
      'MXN': 'es-MX',
      'ARS': 'es-AR',
      'CLP': 'es-CL',
      'ZAR': 'en-ZA',
      'TRY': 'tr-TR',
      'KRW': 'ko-KR',
      'THB': 'th-TH',
      'MYR': 'ms-MY',
      'IDR': 'id-ID',
      'PHP': 'fil-PH',
      'VND': 'vi-VN',
      'EGP': 'ar-EG',
      'SAR': 'ar-SA',
      'AED': 'ar-AE',
      'QAR': 'ar-QA',
      'KWD': 'ar-KW',
      'BHD': 'ar-BH',
      'OMR': 'ar-OM',
      'JOD': 'ar-JO',
      'LBP': 'ar-LB',
      'ILS': 'he-IL',
      'NGN': 'en-NG',
      'GHS': 'en-GH',
      'KES': 'en-KE',
      'UGX': 'en-UG',
      'TZS': 'en-TZ',
      'ETB': 'am-ET',
      'MAD': 'ar-MA',
      'TND': 'ar-TN',
      'DZD': 'ar-DZ',
    };

    return {
      code: data.currency,
      locale: currencyLocaleMap[data.currency] || 'en-US'
    };
  } catch (error) {
    console.error('Error fetching currency settings:', error);
    return { code: 'USD', locale: 'en-US' };
  }
};

export const formatCurrency = async (amount: number, companyId?: string): Promise<string> => {
  try {
    let currencySettings;
    
    if (companyId) {
      currencySettings = await getCurrencySettings(companyId);
    } else {
      // Fallback for when company ID is not available
      const storedCurrency = localStorage.getItem('app_currency') || 'USD';
      currencySettings = { code: storedCurrency, locale: getLocaleForCurrency(storedCurrency) };
    }

    return new Intl.NumberFormat(currencySettings.locale, {
      style: 'currency',
      currency: currencySettings.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (error) {
    console.error('Error formatting currency:', error);
    // Fallback to USD
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
};

const getLocaleForCurrency = (currencyCode: string): string => {
  const currencyLocaleMap: Record<string, string> = {
    'USD': 'en-US',
    'EUR': 'de-DE',
    'GBP': 'en-GB',
    'JPY': 'ja-JP',
    'PKR': 'ur-PK',
    'INR': 'hi-IN',
    'CAD': 'en-CA',
    'AUD': 'en-AU',
    'CHF': 'de-CH',
    'CNY': 'zh-CN',
    'SGD': 'en-SG',
    'HKD': 'en-HK',
    'SEK': 'sv-SE',
    'NOK': 'nb-NO',
    'DKK': 'da-DK',
    'PLN': 'pl-PL',
    'CZK': 'cs-CZ',
    'HUF': 'hu-HU',
    'RUB': 'ru-RU',
    'BRL': 'pt-BR',
    'MXN': 'es-MX',
    'ARS': 'es-AR',
    'CLP': 'es-CL',
    'ZAR': 'en-ZA',
    'TRY': 'tr-TR',
    'KRW': 'ko-KR',
    'THB': 'th-TH',
    'MYR': 'ms-MY',
    'IDR': 'id-ID',
    'PHP': 'fil-PH',
    'VND': 'vi-VN',
    'EGP': 'ar-EG',
    'SAR': 'ar-SA',
    'AED': 'ar-AE',
    'QAR': 'ar-QA',
    'KWD': 'ar-KW',
    'BHD': 'ar-BH',
    'OMR': 'ar-OM',
    'JOD': 'ar-JO',
    'LBP': 'ar-LB',
    'ILS': 'he-IL',
    'NGN': 'en-NG',
    'GHS': 'en-GH',
    'KES': 'en-KE',
    'UGX': 'en-UG',
    'TZS': 'en-TZ',
    'ETB': 'am-ET',
    'MAD': 'ar-MA',
    'TND': 'ar-TN',
    'DZD': 'ar-DZ',
  };
  
  return currencyLocaleMap[currencyCode] || 'en-US';
};

// Enhanced synchronous version that checks for updates
export const formatCurrencySync = (amount: number): string => {
  const storedCurrency = localStorage.getItem('app_currency') || 'USD';
  
  try {
    return new Intl.NumberFormat(getLocaleForCurrency(storedCurrency), {
      style: 'currency',
      currency: storedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (error) {
    console.error('Error formatting currency:', error);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
};

export const calculateMonthlySalaries = async (
  companyId: string,
  month: Date
): Promise<SalaryData[]> => {
  try {
    const [employees, salaryCalculations] = await Promise.all([
      dataIntegrationService.getEmployees(companyId),
      dataIntegrationService.calculateSalariesForMonth(companyId, month)
    ]);

    return salaryCalculations.map(calc => {
      const employee = employees.find(emp => emp.id === calc.employee_id);
      return {
        employee_id: calc.employee_id,
        employee_name: employee?.name || 'Unknown Employee',
        basic_salary: Math.round(calc.basic_salary * 100) / 100,
        present_days: calc.present_days,
        absent_days: calc.absent_days,
        overtime_hours: Math.round(calc.overtime_hours * 100) / 100,
        gross_salary: Math.round(calc.gross_salary * 100) / 100,
        deductions: Math.round(calc.deductions * 100) / 100,
        net_salary: Math.round(calc.net_salary * 100) / 100,
        working_days: calc.working_days
      };
    });
  } catch (error) {
    console.error('Error calculating monthly salaries:', error);
    return [];
  }
};

export const calculateDailySalary = (
  baseSalary: number,
  effectiveDivisor: number = 26
): number => {
  return Math.round((baseSalary / effectiveDivisor) * 100) / 100;
};

export const calculateOvertimePay = (
  baseSalary: number,
  overtimeHours: number,
  effectiveDivisor: number = 26,
  overtimeMultiplier: number = 1.5
): number => {
  const hourlyRate = baseSalary / (effectiveDivisor * 8); // 8 hours per day
  const overtimeRate = hourlyRate * overtimeMultiplier;
  return Math.round(overtimeRate * overtimeHours * 100) / 100;
};
