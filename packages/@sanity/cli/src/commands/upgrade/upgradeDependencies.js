import util from 'util'
import path from 'path'
import {promises as fs} from 'fs'
import boxen from 'boxen'
import rimrafCb from 'rimraf'
import semver from 'semver'
import {padStart, noop} from 'lodash'
import readLocalManifest from '@sanity/util/lib/readLocalManifest'
import findSanityModuleVersions from '../../actions/versions/findSanityModuleVersions'
import {getFormatters} from '../versions/printVersionResult'
import debug from '../../debug'

const rimraf = util.promisify(rimrafCb)

export default async function upgradeDependencies(args, context) {
  const {output, workDir, yarn, chalk} = context
  const {extOptions, argsWithoutOptions} = args
  const modules = argsWithoutOptions.slice()
  const {range, tag} = extOptions
  const saveExact = extOptions['save-exact']
  const targetRange = tag || range

  if (range && tag) {
    throw new Error('Both --tag and --range specified, can only use one')
  }

  if (range && !semver.validRange(range)) {
    throw new Error(`Invalid semver range "${range}"`)
  }

  // Find which modules needs update according to the target range
  const versions = await findSanityModuleVersions(context, {target: targetRange, includeCli: false})
  const allNeedsUpdate = versions.filter((mod) => mod.needsUpdate)

  debug('In need of update: %s', allNeedsUpdate.map((mod) => mod.name).join(', '))

  const needsUpdate =
    modules.length === 0
      ? allNeedsUpdate
      : allNeedsUpdate.filter((outOfDate) => modules.indexOf(outOfDate.name) !== -1)

  const semverBreakingUpgrades = versions.filter(hasSemverBreakingUpgrade)
  const baseMajorUpgrade = semverBreakingUpgrades.find((mod) => mod.name === '@sanity/base')
  const majorUpgrades = semverBreakingUpgrades.filter((mod) => mod.name !== '@sanity/base')
  schedulePrintMajorUpgrades({baseMajorUpgrade, majorUpgrades}, context)

  // If all modules are up-to-date, say so and exit
  if (needsUpdate.length === 0) {
    const specified = modules.length === 0 ? 'All' : 'All *specified*'
    context.output.print(
      `${chalk.green('✔')} ${specified} Sanity modules are at latest compatible versions`
    )
    return
  }

  // Ignore modules that are pinned, but give some indication that this has happened
  const pinned = needsUpdate.filter((mod) => mod.isPinned)
  const nonPinned = needsUpdate.filter((mod) => !mod.isPinned)
  const pinnedNames = pinned.map((mod) => mod.name).join(`\n - `)
  if (nonPinned.length === 0) {
    context.output.warn(
      `${chalk.yellow(
        '⚠'
      )} All modules are pinned to specific versions, not upgrading:\n - ${pinnedNames}`
    )
    return
  }

  if (pinned.length > 0) {
    context.output.warn(
      `${chalk.yellow(
        '⚠'
      )} The follow modules are pinned to specific versions, not upgrading:\n - ${pinnedNames}`
    )
  }

  // Forcefully remove non-symlinked module paths to force upgrade
  await Promise.all(
    nonPinned.map((mod) =>
      deleteIfNotSymlink(
        path.join(context.workDir, 'node_modules', mod.name.replace(/\//g, path.sep))
      )
    )
  )

  // Replace versions in `package.json`
  const versionPrefix = saveExact ? '' : '^'
  const oldManifest = await readLocalManifest(workDir)
  const newManifest = nonPinned.reduce((target, mod) => {
    if (oldManifest.dependencies && oldManifest.dependencies[mod.name]) {
      target.dependencies[mod.name] =
        mod.latestInRange === 'unknown'
          ? oldManifest.dependencies[mod.name]
          : versionPrefix + mod.latestInRange
    }

    if (oldManifest.devDependencies && oldManifest.devDependencies[mod.name]) {
      target.devDependencies[mod.name] =
        mod.latestInRange === 'unknown'
          ? oldManifest.devDependencies[mod.name]
          : versionPrefix + mod.latestInRange
    }

    return target
  }, oldManifest)

  // Write new `package.json`
  const manifestPath = path.join(context.workDir, 'package.json')
  await writeJson(manifestPath, newManifest, {spaces: 2})

  // Run `yarn install`
  const flags = extOptions.offline ? ['--offline'] : []
  const cmd = ['install'].concat(flags)

  debug('Running yarn %s', cmd.join(' '))
  await yarn(cmd, {...output, rootDir: workDir})

  context.output.print('')
  context.output.print(`${chalk.green('✔')} Modules upgraded:`)

  const {versionLength, formatName} = getFormatters(nonPinned)
  nonPinned.forEach((mod) => {
    const current = chalk.yellow(padStart(mod.installed, versionLength))
    const latest = chalk.green(mod.latestInRange)
    context.output.print(`${formatName(mod.name)} ${current} → ${latest}`)
  })
}

function writeJson(filePath, data) {
  return fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

async function deleteIfNotSymlink(modPath) {
  const stats = await fs.lstat(modPath).catch(noop)
  if (!stats || stats.isSymbolicLink()) {
    return null
  }

  return rimraf(modPath)
}

function hasSemverBreakingUpgrade(mod) {
  return !semver.satisfies(mod.latest, `^${mod.installed}`) && semver.gt(mod.latest, mod.installed)
}

function getMajorUpgradeText(mods, chalk) {
  const modNames = mods.map((mod) => `${mod.name} (v${semver.major(mod.latest)})`).join('\n - ')

  return [
    `The following modules has new major versions\n`,
    `released and will have to be manually upgraded:\n\n`,
    ` - ${modNames}\n\n`,
    chalk.yellow('⚠'),
    ` Note that major versions can contain backwards\n`,
    `  incompatible changes and should be handled with care.`,
  ].join('')
}

function getMajorStudioUpgradeText(mod, chalk) {
  const prev = semver.major(mod.installed)
  const next = semver.major(mod.latest)
  return [
    'There is now a new major version of Sanity Studio!',
    '',
    'Read more about the new version and how to upgrade:',
    chalk.blueBright(`https://www.sanity.io/changelog/studio?from=v${prev}&to=v${next}`),
  ].join('\n')
}

function schedulePrintMajorUpgrades({baseMajorUpgrade, majorUpgrades}, {chalk, output}) {
  if (majorUpgrades.length === 0 && !baseMajorUpgrade) {
    return
  }

  process.on('beforeExit', () => {
    output.print('') // Separate previous output with a newline

    if (baseMajorUpgrade) {
      output.warn(
        boxen(getMajorStudioUpgradeText(baseMajorUpgrade, chalk), {
          borderColor: 'green',
          padding: 1,
        })
      )
      return
    }

    output.warn(
      boxen(getMajorUpgradeText(majorUpgrades, chalk), {
        borderColor: 'yellow',
        padding: 1,
      })
    )
  })
}
