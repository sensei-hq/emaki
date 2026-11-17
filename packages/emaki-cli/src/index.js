#!/usr/bin/env node
/* eslint-disable no-console */
// emaki: set a project up for motion stories, install the Claude plugin, and run the production steps
// (validate, sheet, voice, fit, render, build) per film and per locale. Each group of commands is in commands/; they are
// registered in this order, which is the order --help lists them in.
import sade from 'sade'
import pkg from '../package.json' with { type: 'json' }
import { campaignCommands } from './commands/campaign.js'
import { postingCommands } from './commands/posting.js'
import { productionCommands } from './commands/production.js'
import { setupCommands } from './commands/setup.js'

const prog = sade('emaki')
prog.version(pkg.version)

setupCommands(prog)
productionCommands(prog)
postingCommands(prog)
campaignCommands(prog)

prog.parse(process.argv)
