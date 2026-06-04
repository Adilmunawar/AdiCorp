<div align="center">
  <h1>AdiCorp - Next Generation Enterprise HRMS</h1>
  <p><strong>A Modern, Mobile-First Human Resource Management System built for the Future.</strong></p>

  [![GitHub stars](https://img.shields.io/github/stars/Adilmunawar/adicorp.svg)](https://github.com/Adilmunawar/adicorp/stargazers)
  [![GitHub forks](https://img.shields.io/github/forks/Adilmunawar/adicorp.svg)](https://github.com/Adilmunawar/adicorp/network)
  [![GitHub issues](https://img.shields.io/github/issues/Adilmunawar/adicorp.svg)](https://github.com/Adilmunawar/adicorp/issues)
  [![License](https://img.shields.io/github/license/Adilmunawar/adicorp.svg)](https://github.com/Adilmunawar/adicorp/blob/main/LICENSE)
</div>

---

## 🌟 Overview

**AdiCorp** is a comprehensive Human Resource Management System (HRMS) designed to streamline and automate HR processes for modern businesses. Developed by **Adil Munawar**, this advanced system provides a complete solution for managing employee data, attendance tracking, payroll processing, and generating detailed reports. 

Built with scalability, security, and developer experience in mind, AdiCorp features a robust admin dashboard alongside a seamlessly responsive employee self-service portal.

## ✨ Key Features

- **👥 Advanced Employee Management**: Centralized directory with comprehensive profiles, document tracking, and hierarchical role management.
- **⏱️ Automated Attendance & Shifts**: Precision time tracking with multi-tier shift configurations, leave requests, and real-time biometric integration capabilities.
- **💰 Smart Payroll & Overtime**: Dynamic payroll calculator factoring in dynamic daily wages, absence deductions, and complex overtime multipliers.
- **📱 Mobile-First Employee Portal**: A highly-optimized, PWA-ready interface allowing employees to check schedules, payslips, and request leaves on-the-go.
- **🔒 Bank-Grade Security**: Row-level security (RLS) policies driven by Supabase, enforcing strict access controls between admins and employees.

## 🛠️ Technology Stack

- **Frontend**: [React 18](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **State Management**: [TanStack Query](https://tanstack.com/query/latest) + React Context API
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + Storage)
- **Deployment**: [Vercel](https://vercel.com)

---

## 🏗️ System Architecture & Code Structure

The repository is structured around modern React best practices using Vite:

```text
adicorp/
│
├── 📂 src/
│   ├── 📂 components/     # Reusable UI components (auth, layout, settings, etc.)
│   ├── 📂 context/        # Global React Contexts (AuthContext, EmployeeAuthContext)
│   ├── 📂 hooks/          # Custom React hooks (useCurrency, useEmployeePortalData)
│   ├── 📂 integrations/   # External service setups (Supabase clients, generated types)
│   ├── 📂 lib/            # Utilities, branding configuration, and helpers
│   ├── 📂 pages/          # Admin routing views (Dashboard, Employees, Payroll)
│   │   └── 📂 portal/     # Employee-facing mobile portal views
│   ├── 📂 services/       # Core business logic (DataIntegrationService, ReportDataService)
│   ├── 📂 types/          # TypeScript definitions and Supabase table interfaces
│   ├── 📂 utils/          # Pure utility functions for dates, salary calculations, etc.
│   ├── App.tsx            # Main application router and error boundaries
│   └── index.css          # Global Tailwind and base CSS
│
├── 📄 package.json        # Dependencies and scripts
├── 📄 vite.config.ts      # Vite bundler configuration
├── 📄 tailwind.config.ts  # Tailwind theme definitions
└── 📄 vercel.json         # Vercel deployment and caching rules
```

---

## 🗄️ Database Schema

AdiCorp uses a highly relational PostgreSQL schema hosted on Supabase. Below is the core architectural breakdown:

### Table `companies`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` | |
| `currency` | `text` | Nullable |
| `company_size`, `company_type`, `logo`, `phone`, `website`, `address` | `varchar` / `text` | Nullable |

### Table `profiles` (Admin & User Authentication)
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` | Nullable |
| `first_name`, `last_name`, `avatar_url` | `text` | Nullable |
| `is_admin` | `bool` | |

### Table `employees` (Core Workforce Data)
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` | |
| `name`, `rank`, `status`, `wage_rate` | `text` / `numeric` | |
| `salary_divisor`, `working_days_per_week` | `int4` | Nullable |
| `weekend_saturday`, `weekend_sunday` | `bool` | Nullable |
| `email`, `phone`, `cnic`, `shift_type`, `bank_account_number` | `text` | Nullable |

### Table `attendance` & `events`
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `employee_id` / `company_id` | `uuid` | |
| `date` | `date` | |
| `status` / `type` / `title` | `text` | |
| `affects_attendance` | `bool` | |

### Table `leave_requests` & `leave_balances`
Tracks available allowances and approval flows.
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `employee_id`, `leave_type_id` | `uuid` | |
| `start_date`, `end_date` | `date` | |
| `days_count` | `numeric` | |
| `status` | `leave_status` | Enum |

### Table `payslips` & `overtime_records`
Handles all payroll generation and financial snapshots.
| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `employee_id`, `company_id` | `uuid` | |
| `basic_salary`, `gross_salary`, `net_salary` | `numeric` | |
| `days_worked`, `present_days`, `short_leave_days` | `int4` | |
| `deductions` | `jsonb` | Nullable |

### System Configuration Tables
- **`company_working_settings`**: Global default working days and salary divisors.
- **`working_days_config`**: Boolean flags mapping active working days per week.
- **`monthly_working_days`**: JSONB configurations for custom monthly overrides.
- **`overtime_config` & `tier_config`**: Rate multipliers and constraints based on employee tiers.
- **`activity_logs`**: Immutable audit logs of HR actions.
- **`employee_documents`**: Secure references to documents uploaded to Supabase Storage.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- A Supabase Project

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Adilmunawar/adicorp.git
   cd adicorp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   Create a `.env.local` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the Development Server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:8080`.

---

## 🤝 Contributing to AdiCorp

We welcome contributions from developers, designers, and HR professionals to make AdiCorp the standard for open-source Enterprise HR management!

### **Contribution Workflow**
1. **Fork the Repository**
2. **Create a Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Commit your Changes**: `git commit -m 'feat: Add some amazing feature'` (Please follow conventional commits)
4. **Push to the Branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request** describing your changes in detail.

### **Development Guidelines**
- **Type Safety**: Strictly adhere to TypeScript interfaces. Update `types.ts` when modifying Supabase schemas.
- **Styling**: Use Tailwind CSS utilities. Avoid custom CSS unless absolutely necessary.
- **Components**: Utilize `shadcn/ui` components for consistency.

---

## 🗺️ Roadmap

- [ ] Biometric attendance integration via WebAuthn
- [ ] Advanced ML-driven HR insights and attrition prediction
- [ ] Exportable tax and compliance reporting pipelines
- [ ] Multi-tenant organizational restructuring

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### **Professional Support**
For enterprise support, managed hosting, and custom feature development, please contact the lead developer directly.

## 📞 Contact & Developer

**Adil Munawar** - *Lead Developer & Architect*

- 📧 **Email**: [adilmunawarx@gmail.com](mailto:adilmunawarx@gmail.com)
- 🐙 **GitHub**: [@Adilmunawar](https://github.com/Adilmunawar)
- 📸 **Instagram**: [@adilmunawarx](https://instagram.com/adilmunawarx)
- 💼 **LinkedIn**: [Connect with me](https://linkedin.com/in/adilmunawar)
- 🐦 **Twitter**: [@adilmunawarx](https://twitter.com/adilmunawarx)

### **Project Links**
- 🌐 **Live Demo**: [adicorp.vercel.com](https://adicorp.vercel.com)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/Adilmunawar/adicorp/issues)

---

<div align="center">
  <strong>⭐ If AdiCorp helps your business, please consider starring this repository! ⭐</strong><br><br>
  <em>Empowering businesses through innovative HR solutions. Made with ❤️ by Adil Munawar.</em>
</div>
