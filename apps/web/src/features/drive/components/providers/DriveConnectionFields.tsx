import { EditorField } from '@/components/shared/editor-dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import type { DriveProviderId } from '@/features/drive/types'

type ConnectionField = {
  name: string
  label: string
  placeholder: string
  type?: 'text' | 'password' | 'url'
  required?: boolean
}
type DriveConnectionFieldsProps = {
  providerId: DriveProviderId
  initialValues: Record<string, string>
  isEditing: boolean
}
const minioFieldList: ConnectionField[] = [
  {
    name: 'endpoint',
    label: 'S3 endpoint',
    placeholder: 'https://storage.example.com:9000',
    type: 'url',
    required: true,
  },
  {
    name: 'bucket',
    label: 'Bucket',
    placeholder: 'e.g. documents',
    required: true,
  },
  {
    name: 'accessKey',
    label: 'Access Key',
    placeholder: 'Enter access key',
    required: true,
  },
  {
    name: 'secretKey',
    label: 'Secret Key',
    placeholder: 'Enter secret key',
    type: 'password',
    required: true,
  },
  { name: 'region', label: 'Region (optional)', placeholder: 'e.g. us-east-1' },
  {
    name: 'sessionToken',
    label: 'Session Token (optional)',
    placeholder: 'For temporary credentials',
    type: 'password',
  },
  {
    name: 'prefix',
    label: 'Object prefix (optional)',
    placeholder: 'e.g. projects/',
  },
]

/**
 * 渲染Provider专属字段，复用共享编辑控件，不携带其他Provider的输入。
 *
 * @param props - Provider类型和当前会话或非敏感字段默认值
 * @returns 差异化连接字段JSX
 */
const DriveConnectionFields = ({
  providerId,
  initialValues,
  isEditing,
}: DriveConnectionFieldsProps) => {
  // 渲染带标签和校验规则的连接输入字段。
  const renderInputField = (field: ConnectionField) => (
    <EditorField
      key={field.name}
      id={`drive-${field.name}`}
      label={field.label}
    >
      <Input
        id={`drive-${field.name}`}
        name={field.name}
        type={field.type ?? 'text'}
        required={
          field.required &&
          !(isEditing && ['accessKey', 'secretKey'].includes(field.name))
        }
        defaultValue={
          initialValues[field.name] ?? (field.name === 'rootPath' ? '/' : '')
        }
        placeholder={
          isEditing &&
          ['accessKey', 'secretKey', 'sessionToken'].includes(field.name)
            ? 'Leave blank to keep the saved credential'
            : field.placeholder
        }
        autoComplete="off"
        spellCheck={false}
      />
    </EditorField>
  )
  if (providerId === 'minio') return <>{minioFieldList.map(renderInputField)}</>
  return (
    <>
      {providerId === 'aliyun' ? (
        <EditorField id="drive-type" label="Drive type">
          <Select
            name="driveType"
            defaultValue={initialValues.driveType ?? 'default'}
          >
            <SelectTrigger id="drive-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              className={surfaceStyles.surface}
              position="popper"
              align="start"
              sideOffset={6}
            >
              <SelectItem value="default">Default drive</SelectItem>
              <SelectItem value="resource">Resource drive</SelectItem>
              <SelectItem value="backup">Backup drive</SelectItem>
            </SelectContent>
          </Select>
        </EditorField>
      ) : null}
      {renderInputField({
        name: 'rootPath',
        label: 'Root folder',
        placeholder: '/',
      })}
    </>
  )
}

export { DriveConnectionFields }
