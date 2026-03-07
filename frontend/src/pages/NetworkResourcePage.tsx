interface NetworkResourcePageProps {
  title: string;
}

export const NetworkResourcePage = ({ title }: NetworkResourcePageProps) => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">{title} <span className="text-base font-normal text-text-secondary">(Network resources will be available here.)</span></h1>
      </div>
    </div>
  );
};
