import React, {useMemo} from 'react'
import {Button, Menu, MenuButton, MenuItem, PopoverProps} from '@sanity/ui'
import {AddIcon} from '@sanity/icons'
import {BlockItem} from './types'

interface InsertMenuProps {
  disabled: boolean
  items: BlockItem[]
  readOnly: boolean
}

export function InsertMenu(props: InsertMenuProps) {
  const {disabled, items, readOnly} = props

  const popoverProps: PopoverProps = useMemo(
    () => ({
      portal: true,
      placement: 'bottom',
      preventOverflow: true,
    }),
    []
  )

  return (
    <MenuButton
      button={
        <Button
          disabled={disabled || readOnly}
          icon={AddIcon}
          mode="bleed"
          padding={2}
          style={{verticalAlign: 'top'}}
          title="Insert element"
        />
      }
      id="insert-menu"
      menu={
        <Menu>
          {items.map((item) => {
            const title = item.type.title || item.type.type.name
            const handleClick = item.handle

            return (
              <MenuItem
                aria-label={`Insert ${title}${item.inline ? ' (inline)' : ' (block)'}`}
                icon={item.icon}
                key={item.key}
                onClick={handleClick}
                text={title}
                title={`Insert ${title}${item.inline ? ' (inline)' : ' (block)'}`}
              />
            )
          })}
        </Menu>
      }
      popover={popoverProps}
    />
  )
}
