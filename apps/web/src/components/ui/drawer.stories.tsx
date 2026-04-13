import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Button } from "./button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer";

const meta = {
  title: "Components/UI/Drawer",
  component: Drawer,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Drawer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Bottom: Story = {
  render: function BottomStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Open drawer
        </Button>
        <Drawer open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground={false}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Bottom drawer</DrawerTitle>
              <DrawerDescription>
                Uses Vaul for slide + drag; overlay fades via tw-animate utilities.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button type="button" className="w-full">
                  Close
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  },
};

export const WithTrigger: Story = {
  render: () => (
    <Drawer direction="bottom" shouldScaleBackground={false}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline">
          Open (trigger)
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Triggered drawer</DrawerTitle>
          <DrawerDescription>Uncontrolled pattern with DrawerTrigger.</DrawerDescription>
        </DrawerHeader>
      </DrawerContent>
    </Drawer>
  ),
};
