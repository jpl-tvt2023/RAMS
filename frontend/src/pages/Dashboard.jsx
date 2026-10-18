import { Link } from 'react-router-dom';
import { Users, ScrollText } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import TallySyncCard from '../components/dashboard/TallySyncCard';
import MatchingCard from '../components/dashboard/MatchingCard';
import HelpLink from '../components/shared/HelpLink';
import { PERM } from '../utils/roles';
import { useAuth } from '../context/AuthContext';
import { useRBAC } from '../hooks/useRBAC';

export default function Dashboard() {
  const { user } = useAuth();
  const { isAdmin, can } = useRBAC();

  return (
    <AppShell>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand">Welcome, {user?.name}</h1>
          <HelpLink section="dashboard" />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          RAMS keeps the accounts for what ROMS runs: Tally’s invoices and credit notes, linked to the marketplace POs.
        </p>

        {isAdmin && (
          <div className="flex flex-wrap gap-3 mt-6">
            <Link to="/admin/users" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover">
              <Users size={16} /> Users
            </Link>
            <Link to="/admin/audit-log" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-brand text-brand text-sm font-medium hover:bg-brand hover:text-white">
              <ScrollText size={16} /> Audit Log
            </Link>
          </div>
        )}

        <TallySyncCard isAdmin={can([PERM.SYNC_COMPANIES, PERM.SYNC_SCHEDULE])} />
        {can(PERM.MATCHING_VIEW) && <MatchingCard />}
      </div>
    </AppShell>
  );
}
