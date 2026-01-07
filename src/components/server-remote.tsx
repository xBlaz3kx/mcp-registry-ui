import { z } from 'zod';
import { useForm, useWatch } from 'react-hook-form';
import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import type { McpIdeConfigRemote, McpServerItem, McpServerRemote, StackCtrl } from '~/lib/types';
import { Badge } from '~/components/ui/badge';
import { CopyButton } from './ui/copy-button';
import { FormItem, FormLabel, FormControl, FormField, Form, FormDescription, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { getRemoteIcon } from './server-utils';
import { PasswordInput } from './ui/password-input';
import { ServerActionButtons } from './server-action-buttons';
import { DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

/** Display all details on a MCP server */
export const ServerRemote = ({
  item,
  remote,
  remoteIndex,
  stackCtrl,
}: {
  item: McpServerItem;
  remote: McpServerRemote;
  remoteIndex: number;
  stackCtrl: StackCtrl;
}) => {
  // Build initial default values for the zod-based form using package metadata
  const stackEntry = stackCtrl.getFromStack(item.server.name, 'remote', remoteIndex);
  const userConfig = stackEntry?.ideConfig as McpIdeConfigRemote | undefined;

  const initialFormDefaults = {
    headers:
      userConfig?.headers ??
      (remote.headers ? Object.fromEntries(remote.headers.map((ev) => [ev.name, ev.value ?? ev.default ?? ''])) : {}),
    variables: remote.variables
      ? Object.fromEntries(Object.entries(remote.variables).map(([k, v]) => [k, v.value ?? v.default ?? '']))
      : {},
  };

  // Build a per-remote zod schema so we can mark remote-declared headers and variables as required
  const formSchema = useMemo(() => {
    let headersSchema = z.record(z.string(), z.string());
    if (remote.headers && remote.headers.length > 0) {
      const requiredNames = remote.headers.filter((h) => h.isRequired).map((h) => h.name);
      if (requiredNames.length > 0) {
        // Use explicit key/value schemas for z.record and validate required keys via superRefine
        headersSchema = headersSchema.superRefine((rec: Record<string, unknown>, ctx) => {
          requiredNames.forEach((name: string) => {
            const v = rec[name];
            if (typeof v !== 'string' || v.trim().length === 0) {
              ctx.addIssue({
                code: 'custom',
                message: `${name} is required`,
                path: [name],
              });
            }
          });
        });
      }
    }
    let variablesSchema = z.record(z.string(), z.string());
    if (remote.variables) {
      const requiredVarNames = Object.entries(remote.variables)
        .filter(([_, v]) => v.isRequired)
        .map(([k, _]) => k);
      if (requiredVarNames.length > 0) {
        variablesSchema = variablesSchema.superRefine((rec: Record<string, unknown>, ctx) => {
          requiredVarNames.forEach((name: string) => {
            const v = rec[name];
            if (typeof v !== 'string' || v.trim().length === 0) {
              ctx.addIssue({
                code: 'custom',
                message: `${name} is required`,
                path: [name],
              });
            }
          });
        });
      }
    }
    return z.object({ headers: headersSchema, variables: variablesSchema });
  }, [remote.headers, remote.variables]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialFormDefaults,
  });

  // Watch the form values and memoize them so they can be accessed directly
  const watchedValues = useWatch({ control: form.control }) as z.infer<typeof formSchema> | undefined;
  const formValues = useMemo(() => {
    const config: McpIdeConfigRemote = { type: remote.type || '' };
    // Resolve URL with variables if present
    if (remote.url) {
      let resolvedUrl = remote.url;
      if (watchedValues?.variables && Object.keys(watchedValues.variables).length > 0) {
        Object.entries(watchedValues.variables).forEach(([key, value]) => {
          resolvedUrl = resolvedUrl.replace(`{${key}}`, value);
        });
      }
      config.url = resolvedUrl;
    }
    if (watchedValues?.headers && Object.keys(watchedValues.headers).length > 0) {
      config.headers = watchedValues.headers;
    }
    // Note: variables are NOT included in the final config, they're only used to resolve the URL
    return config;
  }, [remote.type, remote.url, watchedValues]);

  // Persist form changes to the stack (debounced) so user edits are saved as they type
  useEffect(() => {
    let t = setTimeout(() => {
      try {
        const currentlyInStack = stackCtrl.getFromStack(item.server.name, 'remote', remoteIndex);
        if (currentlyInStack) {
          stackCtrl.addToStack(item.server.name, 'remote', remote, remoteIndex, formValues);
        }
      } catch (e) {}
    }, 500);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [item.server.name, remoteIndex, remote, formValues, stackCtrl]);

  function onSubmit(_values: z.infer<typeof formSchema>) {
    // console.log('Submit remote form', values);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex gap-2">
          <a
            href={formValues.url || remote.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-2 items-center hover:text-muted-foreground"
          >
            {getRemoteIcon(remote)}
            {formValues.url || remote.url}
          </a>
          <CopyButton content={formValues.url || remote.url || ''} variant="outline" size="sm" />
        </DialogTitle>
        <DialogDescription className="mt-2">
          <span>🚛 Transport:</span> <code className="text-primary">{remote.type}</code>
        </DialogDescription>
      </DialogHeader>
      {/* Remote server details */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {remote.variables && Object.keys(remote.variables).length > 0 && (
            <div>
              <span className="text-muted-foreground">⚙️ URL Variables:</span>
              <div className="mt-2 space-y-2">
                {Object.entries(remote.variables).map(([varName, varDef]) => (
                  <FormField
                    key={varName}
                    control={form.control}
                    name={`variables.${varName}`}
                    render={({ field }) => (
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <FormItem className="flex-1">
                            <FormLabel>
                              <code>{varName}</code>
                              {varDef.format && <Badge variant="outline">{varDef.format}</Badge>}{' '}
                              {varDef.isRequired && <span className="text-red-500">*</span>}{' '}
                              {varDef.isSecret && <span>🔒</span>}
                            </FormLabel>
                            <FormControl>
                              {varDef.isSecret ? (
                                <PasswordInput
                                  required={varDef.isRequired}
                                  placeholder={varDef.default ?? varName ?? ''}
                                  {...field}
                                />
                              ) : (
                                <Input
                                  required={varDef.isRequired}
                                  placeholder={varDef.default ?? varName ?? ''}
                                  {...field}
                                />
                              )}
                            </FormControl>
                            <FormDescription>{varDef.description}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        </div>
                        {varDef.choices && varDef.choices.length > 0 && (
                          <div className="ml-4 mt-1 flex flex-wrap md:flex-nowrap gap-1">
                            {varDef.choices.map((choice: string) => (
                              <Badge key={choice} variant="secondary" className="text-xs px-1 py-0">
                                {choice}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  />
                ))}
              </div>
            </div>
          )}
          {remote.headers && remote.headers.length > 0 && (
            <div>
              <span className="text-muted-foreground">⚙️ Headers:</span>
              <div className="mt-2 space-y-2">
                {remote.headers.map((header) => (
                  <FormField
                    key={header.name}
                    control={form.control}
                    name={`headers.${header.name}`}
                    render={({ field }) => (
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <FormItem className="flex-1">
                            <FormLabel>
                              <code>{header.name}</code>
                              {header.format && <Badge variant="outline">{header.format}</Badge>}{' '}
                              {header.isRequired && <span className="text-red-500">*</span>}{' '}
                              {header.isSecret && <span>🔒</span>}
                            </FormLabel>
                            <FormControl>
                              {header.isSecret ? (
                                <PasswordInput
                                  required={header.isRequired}
                                  placeholder={header.default ?? header.name ?? ''}
                                  {...field}
                                />
                              ) : (
                                <Input
                                  required={header.isRequired}
                                  placeholder={header.default ?? header.name ?? ''}
                                  {...field}
                                />
                              )}
                            </FormControl>
                            <FormDescription>{header.description}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        </div>
                        {header.choices && header.choices.length > 0 && (
                          <div className="ml-4 mt-1 flex flex-wrap md:flex-nowrap gap-1">
                            {header.choices.map((choice: string) => (
                              <Badge key={choice} variant="secondary" className="text-xs px-1 py-0">
                                {choice}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  />
                ))}
              </div>
            </div>
          )}
          {/* Hidden submit button so pressing Enter in any input will submit the form */}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Form>

      {/* Actions buttons (copy config, install in clients) */}
      <ServerActionButtons
        item={item}
        endpoint={remote}
        endpointIndex={remoteIndex}
        formValues={formValues}
        stackCtrl={stackCtrl}
        onClickCopy={async (e) => {
          e.stopPropagation();
          await form.trigger();
        }}
      />
    </>
  );
};
