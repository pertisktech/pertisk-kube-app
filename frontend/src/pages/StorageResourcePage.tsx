interface StorageResourcePageProps {
  title: string;
}

export const StorageResourcePage = ({ title }: StorageResourcePageProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">{title}</h1>
        <p className="text-text-secondary mt-1">Storage resources will be available here.</p>
      </div>
    </div>
  );
};
