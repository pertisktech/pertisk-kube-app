interface StorageResourcePageProps {
  title: string;
}

export const StorageResourcePage = ({ title }: StorageResourcePageProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{title} <span className="text-base font-normal text-text-secondary">(Storage resources will be available here.)</span></h1>
      </div>
    </div>
  );
};
