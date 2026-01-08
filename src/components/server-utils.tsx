import { HardDriveUpload, Rss, Link2, Package } from 'lucide-react';

import type { McpServerPkg, McpServerRemote } from '~/lib/types';
import PypiLogo from '~/components/logos/pypi.svg';
import NpmLogo from '~/components/logos/npm.svg';
import DockerLogo from '~/components/logos/docker.svg';

/** Get icon for remote access points */
export const getRemoteIcon = (remote: McpServerRemote) => {
  return remote.type === 'sse' ? (
    <HardDriveUpload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  ) : remote.type.includes('http') ? (
    <Rss className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  ) : (
    <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  );
};

/** Get icon for package registry */
export const getPkgIcon = (pkg: McpServerPkg) => {
  // Render icons inside a fixed-size square so their visual size doesn't change based on surrounding content
  const baseContainer = 'inline-flex items-center justify-center h-4 w-4 flex-shrink-0';
  if (pkg.registryType === 'npm') {
    return (
      <span className={baseContainer} aria-hidden>
        <img src={NpmLogo} alt="NPM" className="h-full w-full object-contain" style={{ filter: 'grayscale(40%)' }} />
      </span>
    );
  } else if (pkg.registryType === 'pypi') {
    return (
      <span className={baseContainer} aria-hidden>
        <img src={PypiLogo} alt="PyPI" className="h-full w-full object-contain" style={{ filter: 'grayscale(40%)' }} />
      </span>
    );
  } else if (pkg.registryType === 'oci' || pkg.registryType === 'docker') {
    return (
      <span className={baseContainer} aria-hidden>
        <img
          src={DockerLogo}
          alt="Docker"
          className="h-full w-full object-contain"
          style={{ filter: 'grayscale(40%)' }}
        />
      </span>
    );
  } else {
    return (
      <span className={baseContainer} aria-hidden>
        <Package className="h-full w-full text-muted-foreground" />
      </span>
    );
  }
};

/** Get URL to view the package in its registry */
export const getPkgUrl = (pkg: McpServerPkg) => {
  if (pkg.registryType === 'npm') {
    const registryUrl = pkg.registryBaseUrl || 'https://registry.npmjs.com';
    return `${registryUrl.replace('registry', 'www')}/package/${pkg.identifier}`;
  }
  if (pkg.registryType === 'pypi') {
    return `${pkg.registryBaseUrl || 'https://pypi.org'}/project/${pkg.identifier}/`;
  }
  if (pkg.registryType === 'oci') {
    if (pkg.identifier.startsWith('docker.io/')) {
      const cleanIdentifier = pkg.identifier.replace('docker.io/', '').split(':')[0];
      return `https://hub.docker.com/r/${cleanIdentifier}`;
    }
    // If identifier has less than 3 parts when split by /, default to Docker Hub
    if (pkg.identifier.split('/').length < 3) {
      return `https://hub.docker.com/r/${pkg.identifier.split(':')[0]}`;
    }
    // Otherwise, use the identifier as a full URL (e.g., ghcr.io/org/image:tag)
    return `https://${pkg.identifier}`;
  }
  if (pkg.registryType === 'nuget') {
    // return `https://www.nuget.org/packages/${pkg.identifier}/`;
    const registryUrl = pkg.registryBaseUrl || 'https://api.nuget.org/v3/index.json';
    return `${registryUrl.replace('api', 'www').replace(/\/v\d+\/index\.json$/, '')}/packages/${pkg.identifier}`;
  }
  // https://api.nuget.org/TimeMcpServer
  const registryUrl = pkg.registryBaseUrl || '';
  if (!registryUrl) return pkg.identifier;
  return `${registryUrl}/${pkg.identifier}`;
};

/** Get default pkg command based on type */
export const getPkgDefaultCmd = (pkg: McpServerPkg) => {
  if (pkg.runtimeHint) return pkg.runtimeHint;
  if (pkg.registryType === 'npm') return 'npx';
  if (pkg.registryType === 'pypi') return 'uvx';
  if (pkg.registryType === 'oci') return 'docker';
  if (pkg.registryType === 'nuget') return 'dnx';
  return '';
};
