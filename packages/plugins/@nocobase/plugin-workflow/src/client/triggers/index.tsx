import { InfoOutlined } from '@ant-design/icons';
import { createForm } from '@formily/core';
import { ISchema, useForm } from '@formily/react';
import {
  ActionContextProvider,
  FormProvider,
  SchemaComponent,
  SchemaInitializerItemOptions,
  css,
  cx,
  useAPIClient,
  useActionContext,
  useCompile,
  useResourceActionContext,
} from '@nocobase/client';
import { Registry } from '@nocobase/utils/client';
import { Button, Input, Tag, message } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFlowContext } from '../FlowContext';
import { DrawerDescription } from '../components/DrawerDescription';
import { NAMESPACE, lang } from '../locale';
import useStyles from '../style';
import { VariableOptions } from '../variable';
import collection from './collection';
import formTrigger from './form';
import schedule from './schedule/';
import { cloneDeep } from 'lodash';

function useUpdateConfigAction() {
  const form = useForm();
  const api = useAPIClient();
  const { workflow } = useFlowContext() ?? {};
  const ctx = useActionContext();
  const { refresh } = useResourceActionContext();
  return {
    async run() {
      if (workflow.executed) {
        message.error(lang('Trigger in executed workflow cannot be modified'));
        return;
      }
      await form.submit();
      await api.resource('workflows').update?.({
        filterByTk: workflow.id,
        values: {
          config: form.values,
        },
      });
      ctx.setFormValueChanged(false);
      ctx.setVisible(false);
      refresh();
    },
  };
}

export interface Trigger {
  title: string;
  type: string;
  description?: string;
  // group: string;
  useVariables?(config: any, options?): VariableOptions;
  fieldset: { [key: string]: ISchema };
  view?: ISchema;
  scope?: { [key: string]: any };
  components?: { [key: string]: any };
  useInitializers?(config): SchemaInitializerItemOptions | null;
  initializers?: any;
  useActionTriggerable?: boolean | (() => boolean);
}

export const triggers = new Registry<Trigger>();

triggers.register(formTrigger.type, formTrigger);
triggers.register(collection.type, collection);
triggers.register(schedule.type, schedule);

function TriggerExecution() {
  const compile = useCompile();
  const { workflow, execution } = useFlowContext();
  const { styles } = useStyles();

  if (!execution) {
    return null;
  }

  const trigger = triggers.get(workflow.type);

  return (
    <SchemaComponent
      schema={{
        type: 'void',
        name: 'execution',
        'x-component': 'Action',
        'x-component-props': {
          title: <InfoOutlined />,
          shape: 'circle',
          size: 'small',
          className: styles.nodeJobButtonClass,
          type: 'primary',
        },
        properties: {
          [execution.id]: {
            type: 'void',
            'x-decorator': 'Form',
            'x-decorator-props': {
              initialValue: execution,
            },
            'x-component': 'Action.Modal',
            title: (
              <div className={cx(styles.nodeTitleClass)}>
                <Tag>{compile(trigger.title)}</Tag>
                <strong>{workflow.title}</strong>
                <span className="workflow-node-id">#{execution.id}</span>
              </div>
            ),
            properties: {
              createdAt: {
                type: 'string',
                title: `{{t("Triggered at", { ns: "${NAMESPACE}" })}}`,
                'x-decorator': 'FormItem',
                'x-component': 'DatePicker',
                'x-component-props': {
                  showTime: true,
                },
                'x-read-pretty': true,
              },
              context: {
                type: 'object',
                title: `{{t("Trigger variables", { ns: "${NAMESPACE}" })}}`,
                'x-decorator': 'FormItem',
                'x-component': 'Input.JSON',
                'x-component-props': {
                  className: css`
                    padding: 1em;
                    background-color: #eee;
                  `,
                },
                'x-read-pretty': true,
              },
            },
          },
        },
      }}
    />
  );
}

function useFormProviderProps() {
  return { form: useForm() };
}

export const TriggerConfig = () => {
  const api = useAPIClient();
  const { workflow, refresh } = useFlowContext();
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [editingConfig, setEditingConfig] = useState(false);
  const [formValueChanged, setFormValueChanged] = useState(false);
  const { styles } = useStyles();
  const compile = useCompile();

  const { title, type, executed } = workflow;
  const trigger = triggers.get(type);
  const typeTitle = compile(trigger.title);
  const { fieldset, scope, components } = trigger;
  const detailText = executed ? '{{t("View")}}' : '{{t("Configure")}}';
  const titleText = lang('Trigger');

  useEffect(() => {
    if (workflow) {
      setEditingTitle(workflow.title ?? typeTitle);
    }
  }, [workflow]);

  const form = useMemo(() => {
    const values = cloneDeep(workflow?.config);
    return createForm({
      initialValues: values,
      disabled: workflow?.executed,
    });
  }, [workflow]);

  const resetForm = useCallback(
    (editing) => {
      setEditingConfig(editing);
      if (!editing) {
        form.reset();
      }
    },
    [form],
  );

  const onChangeTitle = useCallback(
    async function (next) {
      const t = next || typeTitle;
      setEditingTitle(t);
      if (t === title) {
        return;
      }
      await api.resource('workflows').update?.({
        filterByTk: workflow.id,
        values: {
          title: t,
        },
      });
      refresh();
    },
    [workflow],
  );

  const onOpenDrawer = useCallback(function (ev) {
    if (ev.target === ev.currentTarget) {
      setEditingConfig(true);
      return;
    }
    const whiteSet = new Set(['workflow-node-meta', 'workflow-node-config-button', 'ant-input-disabled']);
    for (let el = ev.target; el && el !== ev.currentTarget; el = el.parentNode) {
      if ((Array.from(el.classList ?? []) as string[]).some((name: string) => whiteSet.has(name))) {
        setEditingConfig(true);
        ev.stopPropagation();
        return;
      }
    }
  }, []);

  return (
    <div
      role="button"
      aria-label={`${titleText}-${editingTitle}`}
      className={cx(styles.nodeCardClass)}
      onClick={onOpenDrawer}
    >
      <div className={cx(styles.nodeMetaClass, 'workflow-node-meta')}>
        <Tag color="gold">{titleText}</Tag>
      </div>
      <div>
        <Input.TextArea
          role="button"
          aria-label="textarea"
          value={editingTitle}
          onChange={(ev) => setEditingTitle(ev.target.value)}
          onBlur={(ev) => onChangeTitle(ev.target.value)}
          autoSize
        />
      </div>
      <TriggerExecution />
      <ActionContextProvider
        value={{
          visible: editingConfig,
          setVisible: resetForm,
          formValueChanged,
          setFormValueChanged,
        }}
      >
        <FormProvider form={form}>
          <SchemaComponent
            scope={{
              ...scope,
              useFormProviderProps,
            }}
            components={components}
            schema={{
              name: `workflow-trigger-${workflow.id}`,
              type: 'void',
              properties: {
                config: {
                  type: 'void',
                  'x-content': detailText,
                  'x-component': Button,
                  'x-component-props': {
                    type: 'link',
                    className: 'workflow-node-config-button',
                  },
                },
                drawer: {
                  type: 'void',
                  title: titleText,
                  'x-component': 'Action.Drawer',
                  'x-decorator': 'FormV2',
                  'x-decorator-props': {
                    // form,
                    useProps: '{{ useFormProviderProps }}',
                  },
                  properties: {
                    ...(trigger.description
                      ? {
                          description: {
                            type: 'void',
                            'x-component': DrawerDescription,
                            'x-component-props': {
                              label: lang('Trigger type'),
                              title: trigger.title,
                              description: trigger.description,
                            },
                          },
                        }
                      : {}),
                    fieldset: {
                      type: 'void',
                      'x-component': 'fieldset',
                      'x-component-props': {
                        className: css`
                          .ant-select.auto-width {
                            width: auto;
                            min-width: 6em;
                          }
                        `,
                      },
                      properties: fieldset,
                    },
                    actions: {
                      ...(executed
                        ? {}
                        : {
                            type: 'void',
                            'x-component': 'Action.Drawer.Footer',
                            properties: {
                              cancel: {
                                title: '{{t("Cancel")}}',
                                'x-component': 'Action',
                                'x-component-props': {
                                  useAction: '{{ cm.useCancelAction }}',
                                },
                              },
                              submit: {
                                title: '{{t("Submit")}}',
                                'x-component': 'Action',
                                'x-component-props': {
                                  type: 'primary',
                                  useAction: useUpdateConfigAction,
                                },
                              },
                            },
                          }),
                    },
                  },
                },
              },
            }}
          />
        </FormProvider>
      </ActionContextProvider>
    </div>
  );
};

export function useTrigger() {
  const { workflow } = useFlowContext();
  return triggers.get(workflow.type);
}

export function getTriggersOptions() {
  return Array.from(triggers.getEntities()).map(([value, { title, ...options }]) => ({
    value,
    label: title,
    color: 'gold',
    options,
  }));
}
