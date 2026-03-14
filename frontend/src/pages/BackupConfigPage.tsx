import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { saveBackupS3Config, testBackupS3, useBackupSettings } from '../hooks/useKubernetes';
import { Eye, EyeOff } from '../components/Icons';
import type { BackupSettings } from '../types';

type BackupS3Config = Pick<
  BackupSettings,
  | 'storage_location_name'
  | 'credentials_secret_name'
  | 's3_bucket'
  | 's3_region'
  | 's3_prefix'
  | 's3_url'
  | 's3_force_path_style'
  | 's3_insecure_skip_tls_verify'
  | 'aws_access_key_id'
  | 'aws_secret_access_key'
>;

const DEFAULT_S3_CONFIG: BackupS3Config = {
  storage_location_name: 'default',
  credentials_secret_name: 'cloud-credentials',
  s3_bucket: '',
  s3_region: '',
  s3_prefix: '',
  s3_url: '',
  s3_force_path_style: true,
  s3_insecure_skip_tls_verify: false,
  aws_access_key_id: '',
  aws_secret_access_key: '',
};

export const BackupConfigPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useBackupSettings();
  const [form, setForm] = useState<BackupS3Config>(DEFAULT_S3_CONFIG);
  const [isTestingS3, setIsTestingS3] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [revealSecretKey, setRevealSecretKey] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      storage_location_name: data.storage_location_name,
      credentials_secret_name: data.credentials_secret_name,
      s3_bucket: data.s3_bucket,
      s3_region: data.s3_region,
      s3_prefix: data.s3_prefix,
      s3_url: data.s3_url,
      s3_force_path_style: data.s3_force_path_style,
      s3_insecure_skip_tls_verify: data.s3_insecure_skip_tls_verify,
      aws_access_key_id: data.aws_access_key_id,
      aws_secret_access_key: data.aws_secret_access_key,
    });
  }, [data]);

  const updateField = <K extends keyof BackupS3Config>(key: K, value: BackupS3Config[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await saveBackupS3Config(form);
      await queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      toast.success('Backup config saved in pertisk-backups.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply config.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleTestS3 = async () => {
    setIsTestingS3(true);
    try {
      const testMessage = await testBackupS3({
        s3_bucket: form.s3_bucket,
        s3_region: form.s3_region,
        s3_prefix: form.s3_prefix,
        s3_url: form.s3_url,
        s3_force_path_style: form.s3_force_path_style,
        s3_insecure_skip_tls_verify: form.s3_insecure_skip_tls_verify,
        aws_access_key_id: form.aws_access_key_id,
        aws_secret_access_key: form.aws_secret_access_key,
      });
      toast.success(testMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to test S3 config.');
    } finally {
      setIsTestingS3(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Config</h1>
        <p className="text-sm text-text-secondary">S3 connection settings only. Supports AWS S3, MinIO, and other S3-compatible endpoints. Apply stores non-secret config in a ConfigMap and credentials in a Secret.</p>
      </div>

      {error && <div className="text-sm text-red-600">{String(error)}</div>}

      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">S3 Bucket</span>
            <input value={form.s3_bucket} onChange={(e) => updateField('s3_bucket', e.target.value)} placeholder="my-backup-bucket" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">S3 Region</span>
            <input value={form.s3_region} onChange={(e) => updateField('s3_region', e.target.value)} placeholder="us-east-1" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">Endpoint</span>
            <input value={form.s3_url} onChange={(e) => updateField('s3_url', e.target.value)} placeholder="https://s3.amazonaws.com or https://minio.example.com" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
            <p className="text-xs text-text-secondary">Optional for AWS S3. Required for MinIO or other S3-compatible storage.</p>
          </label>
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">S3 Prefix</span>
            <input value={form.s3_prefix} onChange={(e) => updateField('s3_prefix', e.target.value)} placeholder="pertisk-backups" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">AWS Access Key ID</span>
            <input value={form.aws_access_key_id} onChange={(e) => updateField('aws_access_key_id', e.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">AWS Secret Access Key</span>
            <div className="relative">
              <input
                type={revealSecretKey ? 'text' : 'password'}
                value={form.aws_secret_access_key}
                onChange={(e) => updateField('aws_secret_access_key', e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setRevealSecretKey((previous) => !previous)}
                className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-text-secondary hover:text-text"
                aria-label={revealSecretKey ? 'Hide secret access key' : 'Show secret access key'}
                title={revealSecretKey ? 'Hide secret access key' : 'Show secret access key'}
              >
                {revealSecretKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.s3_force_path_style}
              onChange={(e) => updateField('s3_force_path_style', e.target.checked)}
            />
            Force path style for MinIO / S3-compatible
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.s3_insecure_skip_tls_verify}
              onChange={(e) => updateField('s3_insecure_skip_tls_verify', e.target.checked)}
            />
            Skip TLS verify
          </label>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={handleTestS3} disabled={isTestingS3 || isApplying || isLoading} className="inline-flex items-center px-4 py-2 rounded-lg border border-border bg-surface-elevated text-sm font-medium hover:bg-hover transition-colors disabled:opacity-50">
            {isTestingS3 ? 'Testing...' : 'Test S3'}
          </button>
          <button type="button" onClick={handleApply} disabled={isApplying || isLoading} className="inline-flex items-center px-4 py-2 rounded-lg border border-border bg-surface-elevated text-sm font-medium hover:bg-hover transition-colors disabled:opacity-50">
            {isApplying ? 'Applying...' : 'Apply Config'}
          </button>
        </div>
      </div>
    </div>
  );
};
