import { z } from 'zod';
import { useMemo, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type {
  EnvVarOrHeader,
  McpIdeConfigPkg,
  McpServerItem,
  McpServerPkg,
  McpServerPkgArg,
  StackCtrl,
} from '~/lib/types';
import { Badge } from '~/components/ui/badge';
import { CopyButton } from './ui/copy-button';
import { FormItem, FormLabel, FormControl, FormField, Form, FormDescription, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { getPkgDefaultCmd, getPkgIcon, getPkgUrl } from './server-utils';
import { PasswordInput } from './ui/password-input';
import { ServerActionButtons } from './server-action-buttons';
import { DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

/** Display all details on a MCP server */
export const ServerPkg = ({
  item,
  pkg,
  pkgIndex,
  stackCtrl,
}: {
  item: McpServerItem;
  pkg: McpServerPkg;
  pkgIndex: number;
  stackCtrl: StackCtrl;
}) => {
  // If the user saved an ideConfig for this stack entry, use it as initial defaults
  const stackEntry = stackCtrl.getFromStack(item.server.name, 'package', pkgIndex);
  const userConfig = stackEntry?.ideConfig as McpIdeConfigPkg | undefined;

  const initialPkgFormDefaults = useMemo(() => {
    // Compute default runtime args length for splitting userConfig.args
    const runtimeArgsCount = pkg.runtimeArguments?.length ?? 0;
    // If user already saved config, split the args array back into runtimeArgs and packageArgs
    // Note: the saved args format is [runtimeArgs..., packageIdentifier, packageArgs...]
    const savedRuntimeArgs = userConfig?.args?.slice(0, runtimeArgsCount);
    // Skip the packageIdentifier (at index runtimeArgsCount) and get packageArgs after it
    const savedPackageArgs = userConfig?.args?.slice(runtimeArgsCount + 1);
    return {
      command: userConfig?.command ?? getPkgDefaultCmd(pkg),
      // For runtime arguments use the provided value when available. For "named" flags that don't have
      // an explicit value, default to the flag name so the form will include the flag when submitted
      args:
        savedRuntimeArgs ??
        (pkg.runtimeArguments
          ? pkg.runtimeArguments.map((a) => a.value ?? (a.type === 'named' && !a.format ? (a.name ?? '') : ''))
          : []),
      // Package arguments are passed to the package binary (after runtime args)
      packageArgs:
        savedPackageArgs ??
        (pkg.packageArguments
          ? pkg.packageArguments.map(
              (a) => a.value ?? a.default ?? (a.type === 'named' && !a.format ? (a.name ?? '') : '')
            )
          : []),
      env:
        userConfig?.env ??
        (pkg.environmentVariables
          ? Object.fromEntries(pkg.environmentVariables.map((ev) => [ev.name, ev.value ?? ev.default ?? '']))
          : {}),
    } as const;
  }, [userConfig, pkg]);

  // Build a per-package zod schema so we can mark package-declared env vars as required
  const formSchema = useMemo(() => {
    const baseShape = {
      command: z.string().min(1, {
        message: 'Command to run the MCP server must be at least 1 character.',
      }),
      args: z.array(z.string()).optional(),
      packageArgs: z.array(z.string()).optional(),
    };
    let envSchema = z.record(z.string(), z.string());
    if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
      const requiredNames = pkg.environmentVariables.filter((ev) => ev.isRequired).map((ev) => ev.name);
      if (requiredNames.length > 0) {
        // Use explicit key/value schemas for z.record and validate required keys via superRefine
        envSchema = envSchema.superRefine((rec: Record<string, unknown>, ctx) => {
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
    return z.object({ ...baseShape, env: envSchema });
  }, [pkg.environmentVariables]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialPkgFormDefaults,
  });

  // Watch the form values and memoize them so they can be accessed directly
  const watchedValues = useWatch({ control: form.control }) as z.infer<typeof formSchema> | undefined;
  const formValues = useMemo(() => {
    const config: McpIdeConfigPkg = { command: watchedValues?.command || '' };

    // Helper to expand args with their names for "named" type arguments
    const expandArgs = (argValues: string[], argDefs?: McpServerPkgArg[]): string[] => {
      if (!argDefs) return argValues.filter((a) => a !== undefined && a !== '');
      const result: string[] = [];
      argDefs.forEach((argDef, i) => {
        const value = argValues[i];
        if (value === undefined || value === '') return;
        if (argDef.type === 'named' && argDef.name) {
          // For boolean flags, only include the flag name if value is truthy (not 'false')
          if (argDef.format === 'boolean') {
            if (value === 'true' || value === argDef.name) {
              result.push(argDef.name);
            }
            // If value is 'false' or empty, skip the flag entirely
          } else {
            // For named args with values, add both the flag and the value
            result.push(argDef.name);
            // Only add value if it's different from the flag name itself (i.e., actual value provided)
            if (value !== argDef.name) {
              result.push(value);
            }
          }
        } else {
          // Positional arguments - just add the value
          result.push(value);
        }
      });
      return result;
    };

    // Combine runtime args, package identifier, and package args into a single args array for the IDE config
    const runtimeArgs = expandArgs(watchedValues?.args ?? [], pkg.runtimeArguments);
    const packageArgs = expandArgs(watchedValues?.packageArgs ?? [], pkg.packageArguments);

    // For Docker pkgs, if command is docker and first arg is not 'run', add sensible defaults
    if (pkg.registryType === 'oci' && config.command === 'docker' && runtimeArgs[0] !== 'run') {
      config.args = ['run', ...runtimeArgs, pkg.identifier, ...packageArgs];
    } else {
      config.args = [...runtimeArgs, pkg.identifier, ...packageArgs];
    }
    if (watchedValues?.env) {
      const filteredEnv = Object.fromEntries(
        Object.entries(watchedValues.env).filter(([, v]) => v != null && v !== '')
      );
      if (Object.keys(filteredEnv).length > 0) {
        config.env = filteredEnv;
      }
    }
    return config;
  }, [watchedValues, pkg.registryType, pkg.identifier, pkg.runtimeArguments, pkg.packageArguments]);

  // Persist form changes to the stack (debounced) so user edits are saved as they type
  useEffect(() => {
    let t = setTimeout(() => {
      try {
        const currentlyInStack = stackCtrl.getFromStack(item.server.name, 'package', pkgIndex);
        if (currentlyInStack) stackCtrl.addToStack(item.server.name, 'package', pkg, pkgIndex, formValues);
      } catch (e) {}
    }, 500);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [item.server.name, pkg, pkgIndex, formValues, stackCtrl]);

  function onSubmit(_values: z.infer<typeof formSchema>) {
    // console.log('Submitted pkg form', values);
  }

  const packageUrl = getPkgUrl(pkg);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex gap-2">
          {packageUrl ? (
            <a
              href={packageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2 items-center hover:text-muted-foreground"
            >
              {getPkgIcon(pkg)}
              <code className="px-2">{pkg.identifier}</code>
            </a>
          ) : (
            <span>
              {getPkgIcon(pkg)} <code>{pkg.identifier}</code>
            </span>
          )}
          <CopyButton content={pkg.identifier} variant="outline" size="sm" />
        </DialogTitle>
        <DialogDescription>
          <span>📦 Type:</span> <code className="text-primary">{pkg.registryType}</code>
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6">
        {/* Package details */}
        <div>
          {pkg.registryBaseUrl && (
            <p>
              <span className="text-muted-foreground">📘 Registry:</span>{' '}
              <a
                href={pkg.registryBaseUrl}
                className="hover:text-muted-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                {pkg.registryBaseUrl}
              </a>
            </p>
          )}
          {pkg.version && (
            <p>
              <span className="text-muted-foreground">🏷️ Version:</span> <code>{pkg.version}</code>
            </p>
          )}
          {pkg.transport && (
            <p>
              <span className="text-muted-foreground">🚛 Transport:</span> <code>{pkg.transport.type}</code>
              {pkg.transport.url && (
                <>
                  {' '}
                  <a
                    href={pkg.transport.url}
                    className="hover:text-muted-foreground"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {pkg.transport.url}
                  </a>
                </>
              )}
            </p>
          )}
          {pkg.runtimeHint && (
            <p>
              <span className="text-muted-foreground">💡 Runtime hint:</span> <code>{pkg.runtimeHint}</code>
            </p>
          )}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="command"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>⌨️ Command</FormLabel>
                  <FormControl>
                    <Input placeholder="Command to run the MCP server." required={true} {...field} />
                  </FormControl>
                  <FormDescription>Command to run the MCP server.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {pkg.runtimeArguments && pkg.runtimeArguments.length > 0 && (
              <div>
                <span>⚡ Runtime Arguments</span>
                <div className="mt-2 space-y-2">
                  {pkg.runtimeArguments.map((arg: McpServerPkgArg, aIndex: number) => (
                    <FormField
                      key={`rt-${aIndex}`}
                      name={`args.${aIndex}`}
                      control={form.control}
                      render={({ field }) => (
                        <div className="text-xs">
                          <div className="flex items-center gap-2">
                            <FormItem className="flex-1">
                              <FormLabel>
                                <code>{arg.name ?? arg.value ?? `arg-${aIndex}`}</code>
                                {arg.format && <Badge variant="outline">{arg.format}</Badge>}{' '}
                                {arg.isRequired && <Badge variant="destructive">required</Badge>}{' '}
                                {arg.isSecret && <span className="text-orange-500">🔒</span>}
                              </FormLabel>
                              {arg.format || arg.value ? (
                                <FormControl>
                                  <Input
                                    placeholder={arg.valueHint ?? arg.default ?? arg.description ?? ''}
                                    required={arg.isRequired}
                                    {...field}
                                  />
                                </FormControl>
                              ) : arg.type === 'named' ? (
                                // For named flags with no input, include a hidden native input bound to
                                // react-hook-form so the flag (arg.name) is part of the submitted args
                                <>
                                  <FormControl>
                                    <Input type="hidden" {...field} />
                                  </FormControl>
                                </>
                              ) : null}
                              <FormDescription>{arg.description}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          </div>

                          {arg.choices && arg.choices.length > 0 && (
                            <div className="ml-4 mt-1 flex flex-wrap md:flex-nowrap gap-1">
                              {arg.choices.map((choice: string) => (
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
            {pkg.packageArguments && pkg.packageArguments.length > 0 && (
              <div>
                <span>📦 Package Arguments</span>
                <div className="mt-2 space-y-2">
                  {pkg.packageArguments.map((arg: McpServerPkgArg, aIndex: number) => (
                    <FormField
                      key={`pkg-${aIndex}`}
                      name={`packageArgs.${aIndex}`}
                      control={form.control}
                      render={({ field }) => (
                        <div className="text-xs">
                          <div className="flex items-center gap-2">
                            <FormItem className="flex-1">
                              <FormLabel>
                                <code>{arg.name ?? arg.value ?? `arg-${aIndex}`}</code>
                                {arg.format && <Badge variant="outline">{arg.format}</Badge>}{' '}
                                {arg.isRequired && <Badge variant="destructive">required</Badge>}{' '}
                                {arg.isSecret && <span className="text-orange-500">🔒</span>}
                              </FormLabel>
                              {arg.format || arg.value || arg.default ? (
                                <FormControl>
                                  <Input
                                    placeholder={arg.valueHint ?? arg.default ?? arg.description ?? ''}
                                    required={arg.isRequired}
                                    {...field}
                                  />
                                </FormControl>
                              ) : arg.type === 'named' ? (
                                // For named flags with no input, include a hidden native input bound to
                                // react-hook-form so the flag (arg.name) is part of the submitted args
                                <>
                                  <FormControl>
                                    <Input type="hidden" {...field} />
                                  </FormControl>
                                </>
                              ) : null}
                              <FormDescription>{arg.description}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          </div>

                          {arg.choices && arg.choices.length > 0 && (
                            <div className="ml-4 mt-1 flex flex-wrap md:flex-nowrap gap-1">
                              {arg.choices.map((choice: string) => (
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
            {pkg.environmentVariables && pkg.environmentVariables.length > 0 && (
              <div>
                <FormLabel>⚙️ Environment Variables</FormLabel>
                <div className="mt-3 space-y-4">
                  {pkg.environmentVariables.map((envVar: EnvVarOrHeader) => (
                    <FormField
                      key={envVar.name}
                      control={form.control}
                      name={`env.${envVar.name}`}
                      render={({ field }) => (
                        <div className="text-xs">
                          <div className="flex items-center gap-2">
                            <FormItem className="flex-1">
                              <FormLabel className="flex flex-wrap md:flex-nowrap">
                                <code>{envVar.name}</code>
                                {envVar.format && <Badge variant="outline">{envVar.format}</Badge>}{' '}
                                {envVar.isRequired && <span className="text-red-500">*</span>}{' '}
                                {envVar.isSecret && <span className="text-orange-500">🔒</span>}
                              </FormLabel>
                              <FormControl>
                                {envVar.isSecret ? (
                                  <PasswordInput
                                    required={envVar.isRequired}
                                    placeholder={envVar.default ?? envVar.name ?? ''}
                                    {...field}
                                  />
                                ) : (
                                  <Input
                                    required={envVar.isRequired}
                                    placeholder={envVar.default ?? envVar.name ?? ''}
                                    {...field}
                                  />
                                )}
                              </FormControl>
                              <FormDescription>{envVar.description}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          </div>
                          {envVar.choices && envVar.choices.length > 0 && (
                            <div className="ml-4 mt-1 flex flex-wrap md:flex-nowrap gap-1">
                              {envVar.choices.map((choice: string) => (
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
      </div>

      {/* Actions buttons (copy config, install in clients) */}
      <ServerActionButtons
        item={item}
        endpoint={pkg}
        endpointIndex={pkgIndex}
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
