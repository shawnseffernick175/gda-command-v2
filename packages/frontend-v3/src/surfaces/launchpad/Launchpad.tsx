import { useLaunchpadSummary, useLaunchpadFlags } from './api';
import { SummaryCardGrid } from './SummaryCardGrid';
import { FlagsPanel } from './FlagsPanel';
import { RecentDecisions } from '../decisions/RecentDecisions';

export function Launchpad() {
  const summary = useLaunchpadSummary();
  const flags = useLaunchpadFlags();

  return (
    <div className="flex flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold text-ink-primary">Launchpad</h1>

      <SummaryCardGrid
        data={summary.data}
        isLoading={summary.isLoading}
        isError={summary.isError}
        error={summary.error}
        refetch={summary.refetch}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        <FlagsPanel
          data={flags.data}
          isLoading={flags.isLoading}
          isError={flags.isError}
          error={flags.error}
          refetch={flags.refetch}
        />
      </div>

      <RecentDecisions />
    </div>
  );
}
