import 'zone.js'
import 'core-js/proposals/reflect-metadata'
import 'rxjs'

import './global.scss'
import './toastr.scss'

import { enableProdMode, NgModuleRef, ApplicationRef } from '@angular/core'
import { enableDebugTools } from '@angular/platform-browser'
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic'
import { ipcRenderer } from 'electron'

import { getRootModule } from './app.module'
import { findPlugins, initModuleLookup, loadPlugins } from './plugins'
import { BootstrapData, BOOTSTRAP_DATA } from '../../terminus-core/src/api/mainProcess'

// Always land on the start view
location.hash = ''

;(process as any).enablePromiseAPI = true

if (process.platform === 'win32' && !('HOME' in process.env)) {
    process.env.HOME = `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
}

if (process.env.TERMINUS_DEV && !process.env.TERMINUS_FORCE_ANGULAR_PROD) {
    console.warn('Running in debug mode')
} else {
    enableProdMode()
}

async function bootstrap (bootstrapData: BootstrapData, safeMode = false): Promise<NgModuleRef<any>> {
    if (safeMode) {
        bootstrapData.installedPlugins = bootstrapData.installedPlugins.filter(x => x.isBuiltin)
    }

    const pluginModules = await loadPlugins(bootstrapData.installedPlugins, (current, total) => {
        (document.querySelector('.progress .bar') as HTMLElement).style.width = `${100 * current / total}%` // eslint-disable-line
    })
    const module = getRootModule(pluginModules)
    window['rootModule'] = module
    const moduleRef = await platformBrowserDynamic([
        { provide: BOOTSTRAP_DATA, useValue: bootstrapData },
    ]).bootstrapModule(module)
    if (process.env.TERMINUS_DEV) {
        const applicationRef = moduleRef.injector.get(ApplicationRef)
        const componentRef = applicationRef.components[0]
        enableDebugTools(componentRef)
    }
    return moduleRef
}

ipcRenderer.once('start', async (_$event, bootstrapData: BootstrapData) => {
    console.log('Window bootstrap data:', bootstrapData)

    initModuleLookup(bootstrapData.userPluginsPath)

    let plugins = await findPlugins()
    if (bootstrapData.config.pluginBlacklist) {
        plugins = plugins.filter(x => !bootstrapData.config.pluginBlacklist.includes(x.name))
    }
    plugins = plugins.filter(x => x.name !== 'web')
    bootstrapData.installedPlugins = plugins

    console.log('Starting with plugins:', plugins)
    try {
        await bootstrap(bootstrapData)
    } catch (error) {
        console.error('Angular bootstrapping error:', error)
        console.warn('Trying safe mode')
        window['safeModeReason'] = error
        try {
            await bootstrap(bootstrapData, true)
        } catch (error2) {
            console.error('Bootstrap failed:', error2)
        }
    }
})

ipcRenderer.send('ready')
