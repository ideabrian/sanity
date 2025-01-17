import React, {memo, useCallback, useMemo} from 'react'
import {CollapseMenu, CollapseMenuButton, CollapseMenuButtonProps} from '@sanity/base/components'
import {Button, PopoverProps} from '@sanity/ui'
import {EllipsisVerticalIcon} from '@sanity/icons'
import {PortableTextEditor, usePortableTextEditor} from '@sanity/portable-text-editor'
import {PTEToolbarAction, PTEToolbarActionGroup} from './types'
import {useActiveActionKeys, useFeatures, useFocusBlock} from './hooks'
import {getActionIcon} from './helpers'

const CollapseMenuMemo = memo(CollapseMenu)

const MENU_POPOVER_PROPS: PopoverProps = {constrainSize: true}
const COLLAPSE_BUTTON_PROPS: CollapseMenuButtonProps = {padding: 2, mode: 'bleed'}

interface ActionMenuProps {
  disabled: boolean
  groups: PTEToolbarActionGroup[]
  isFullscreen?: boolean
  collapsed?: boolean
}

export const ActionMenu = memo(function ActionMenu(props: ActionMenuProps) {
  const {disabled: disabledProp, groups, isFullscreen, collapsed} = props
  const focusBlock = useFocusBlock()
  const features = useFeatures()
  const editor = usePortableTextEditor()

  const isVoidBlock = focusBlock?._type !== features.types.block.name
  const isEmptyTextBlock =
    !isVoidBlock && focusBlock?.children.length === 1 && focusBlock?.children[0].text === ''

  const disabled = disabledProp || isVoidBlock

  const actions: Array<PTEToolbarAction & {firstInGroup?: true}> = useMemo(
    () =>
      groups.reduce<Array<PTEToolbarAction & {firstInGroup?: true}>>((acc, group) => {
        return acc.concat(
          group.actions.map(
            // eslint-disable-next-line max-nested-callbacks
            (action: PTEToolbarAction, actionIndex) => {
              if (actionIndex === 0) return {...action, firstInGroup: true}
              return action
            }
          )
        )
      }, []),
    [groups]
  )

  const activeKeys = useActiveActionKeys({actions})

  const handleMenuClose = useCallback(() => {
    PortableTextEditor.focus(editor)
  }, [editor])

  const children = useMemo(
    () =>
      actions.map((action) => {
        const annotationDisabled = action.type === 'annotation' && isEmptyTextBlock
        const active = activeKeys.includes(action.key)
        return (
          <CollapseMenuButton
            disabled={disabled || annotationDisabled}
            buttonProps={COLLAPSE_BUTTON_PROPS}
            dividerBefore={action.firstInGroup}
            icon={getActionIcon(action, active)}
            key={action.key}
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => action.handle(active)}
            selected={active}
            text={action.title || action.key}
            tooltipProps={{
              disabled: disabled || annotationDisabled,
              placement: isFullscreen ? 'bottom' : 'top',
              portal: 'default',
            }}
          />
        )
      }),
    [actions, activeKeys, disabled, isEmptyTextBlock, isFullscreen]
  )

  const menuButton = useMemo(
    () => <Button icon={EllipsisVerticalIcon} mode="bleed" padding={2} disabled={disabled} />,
    [disabled]
  )

  return (
    <CollapseMenuMemo
      collapsed={collapsed}
      gap={1}
      menuButton={menuButton}
      menuPopoverProps={MENU_POPOVER_PROPS}
      onMenuClose={handleMenuClose}
      disableRestoreFocusOnClose
    >
      {children}
    </CollapseMenuMemo>
  )
})
