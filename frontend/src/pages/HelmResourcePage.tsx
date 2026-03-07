interface HelmResourcePageProps {
  title: string;
}

export const HelmResourcePage = ({ title }: HelmResourcePageProps) => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">{title} <span className="text-base font-normal text-text-secondary">(Helm resources will be available here.)</span></h1>
      </div>
    </div>
  );
};
