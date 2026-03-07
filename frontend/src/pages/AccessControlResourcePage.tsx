interface AccessControlResourcePageProps {
  title: string;
}

export const AccessControlResourcePage = ({ title }: AccessControlResourcePageProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{title} <span className="text-base font-normal text-text-secondary">(Access control resources will be available here.)</span></h1>
      </div>
    </div>
  );
};
